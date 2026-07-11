import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { QueueBoard } from "./QueueBoard";

function formatWhen(d: Date) {
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${time} · ${day}`;
}

export default async function ApprovalQueue() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [items, skills] = await Promise.all([
    db.journalItem.findMany({
      where: { status: "PENDING", class: { teacherId: user.teacher.id } },
      orderBy: { createdAt: "asc" },
      include: {
        student: { select: { name: true, avatarColor: true } },
        assignment: { select: { title: true } },
      },
    }),
    db.skill.findMany({ orderBy: { name: "asc" } }),
  ]);

  const mapped = items.map((it) => ({
    id: it.id,
    child: it.student.name,
    color: it.student.avatarColor,
    type: it.type,
    mediaPath: it.mediaPath,
    text: it.textContent,
    activity: it.assignment?.title ?? "Free choice",
    when: formatWhen(it.createdAt),
  }));

  return (
    <div className="sj" style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column" }}>
      <TopBar links={teacherNav(items.length)} />
      <main style={{ maxWidth: 1060, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "28px 32px 60px", flex: 1 }}>
        <QueueBoard items={mapped} skills={skills} />
      </main>
    </div>
  );
}
