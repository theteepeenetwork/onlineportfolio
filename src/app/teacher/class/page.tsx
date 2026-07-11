import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { relativeDay } from "@/lib/relativeDay";
import { ClassManager, type ClassCard } from "./ClassManager";

// Per-class tints, cycled by position: kraft/jam, glass, pink (per the handoff).
const CLASS_TINTS = [
  { color: "#F3E3C3", jarFill: "#C2476B" },
  { color: "#D8ECE8", jarFill: "#4E9C94" },
  { color: "#F7E0E6", jarFill: "#E08A9B" },
  { color: "#FBEED3", jarFill: "#F0B441" },
  { color: "#E7DEF3", jarFill: "#B99CD6" },
];

export default async function ClassPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const classes = await db.class.findMany({
    where: { teacherId: user.teacher.id },
    orderBy: { createdAt: "asc" },
    include: {
      students: {
        orderBy: { name: "asc" },
        include: {
          journalItems: { select: { status: true, approvedAt: true, createdAt: true } },
        },
      },
    },
  });

  const now = new Date();
  const cards: ClassCard[] = classes.map((c, i) => {
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
      code: c.classCode,
      color: tint.color,
      jarFill: tint.jarFill,
      kids: roster.length,
      moments: roster.reduce((a, k) => a + k.moments, 0),
      waiting: roster.reduce((a, k) => a + k.waiting, 0),
      roster,
    };
  });

  const pendingCount = cards.reduce((a, c) => a + c.waiting, 0);

  return (
    <>
      <TopBar links={teacherNav(pendingCount)} />
      <main className="sj" style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: "28px 24px 80px", boxSizing: "border-box", fontFamily: "var(--font-atkinson)", color: "var(--ink)" }}>
        <ClassManager classes={cards} />
      </main>
    </>
  );
}
