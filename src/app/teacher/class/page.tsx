import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { relativeDay } from "@/lib/relativeDay";
import { CLASS_TINTS } from "@/lib/classTints";
import { resolveAgeMode } from "@/lib/ageMode";
import { ClassManager, type ClassCard } from "./ClassManager";

export default async function ClassPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const classes = await db.class.findMany({
    // Archived classes are last year's and are not managed here. See the rail.
    where: { teacherId: user.teacher.id, archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      students: {
        orderBy: { name: "asc" },
        include: {
          journalItems: { select: { status: true, approvedAt: true, createdAt: true } },
        },
      },
      // Has the school asked this teacher for a copy of this class, and not had
      // it yet? (docs/paid-tier-plan.md item 3.) At most one is outstanding per
      // class — the action refuses a second — so `take: 1` is the shape rather
      // than a truncation.
      exportRequests: {
        where: { fulfilledAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, requestReason: true, requestedByName: true, createdAt: true },
      },
    },
  });

  const now = new Date();
  const askedOn = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const cards: ClassCard[] = classes.map((c, i) => {
    const ask = c.exportRequests[0] ?? null;
    const tint = CLASS_TINTS[i % CLASS_TINTS.length];
    const roster = c.students.map((s) => {
      const approved = s.journalItems.filter((j) => j.status === "APPROVED");
      const waiting = s.journalItems.filter((j) => j.status === "PENDING").length;
      const lastAt = approved
        .map((j) => j.approvedAt ?? j.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        id: s.id,
        name: s.name,
        initial: (s.name[0] ?? "?").toUpperCase(),
        avatarColor: s.avatarColor,
        moments: approved.length,
        waiting,
        last: lastAt ? relativeDay(lastAt, now) : "not yet",
      };
    });
    return {
      id: c.id,
      name: c.name,
      year: c.yearGroup ?? "Class jar",
      ageMode: resolveAgeMode(c.ageMode),
      code: c.classCode,
      color: tint.color,
      jarFill: tint.jarFill,
      kids: roster.length,
      moments: roster.reduce((a, k) => a + k.moments, 0),
      waiting: roster.reduce((a, k) => a + k.waiting, 0),
      roster,
      exportRequest: ask
        ? { id: ask.id, reason: ask.requestReason, askedBy: ask.requestedByName, askedOn: askedOn(ask.createdAt) }
        : null,
    };
  });

  return (
    <div style={{ maxWidth: 1040 }}>
      {/* ClassManager reads the open class from the URL (?class=), so it needs
          a Suspense boundary around useSearchParams. */}
      <Suspense fallback={null}>
        <ClassManager classes={cards} />
      </Suspense>
    </div>
  );
}
