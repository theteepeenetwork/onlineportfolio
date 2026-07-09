import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { QueueItem } from "./QueueItem";

export default async function ApprovalQueue() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [items, skills] = await Promise.all([
    db.journalItem.findMany({
      where: {
        status: "PENDING",
        class: { teacherId: user.teacher.id },
      },
      orderBy: { createdAt: "asc" },
      include: {
        skills: { select: { id: true, name: true } },
        student: { select: { name: true, avatarColor: true } },
      },
    }),
    db.skill.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <TopBar
        title="Approvals"
        subtitle="Nothing goes into a child's journal until you say so."
        links={teacherNav(items.length)}
      />

      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        {items.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-4xl">🎉</div>
            <p className="mt-2 font-semibold">You&apos;re all caught up!</p>
            <p className="text-sm text-muted">
              New work from your class will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {items.map((item) => (
              <QueueItem
                key={item.id}
                item={item}
                student={item.student}
                skills={skills}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
