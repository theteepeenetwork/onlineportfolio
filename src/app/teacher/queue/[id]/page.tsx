import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { StickerSheet } from "./StickerSheet";

// The sticker sheet (design 1b): open one waiting moment full-size, peel up to
// four stickers onto the work, add a kind note, and drop it in the jar.

function formatWhen(d: Date) {
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${time} · ${day}`;
}

export default async function StickerSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { id } = await params;

  // Only a PENDING moment in one of this teacher's own classes — a guessed id
  // from another class or school resolves to nothing (SAFEGUARDING rules 4 & 8).
  const item = await db.journalItem.findFirst({
    where: { id, status: "PENDING", class: { teacherId: user.teacher.id } },
    include: {
      student: { select: { name: true } },
      assignment: { select: { title: true } },
    },
  });
  if (!item) notFound();

  const pendingCount = await db.journalItem.count({
    where: { status: "PENDING", class: { teacherId: user.teacher.id } },
  });

  return (
    <div className="sj" style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column" }}>
      <TopBar links={teacherNav(pendingCount)} />
      <main style={{ maxWidth: 760, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "28px 32px 60px", flex: 1 }}>
        <Link href="/teacher/queue" style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", textDecoration: "none" }}>
          ← Back to the queue
        </Link>
        <h1 style={{ margin: "14px 0 4px", font: "600 30px var(--font-fredoka)" }}>The sticker sheet</h1>
        <p style={{ margin: "0 0 20px", font: "400 15px/1.55 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: "40em" }}>
          Peel up to 4 stickers onto {item.student.name}&apos;s work, add a kind note, and drop it in the jar.
        </p>
        <StickerSheet
          item={{
            id: item.id,
            child: item.student.name,
            type: item.type,
            mediaPath: item.mediaPath,
            text: item.textContent,
            caption: item.caption,
            activity: item.assignment?.title ?? "Free choice",
            when: formatWhen(item.createdAt),
          }}
        />
      </main>
    </div>
  );
}
