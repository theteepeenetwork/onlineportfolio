import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { JournalItemCard } from "@/components/JournalItemCard";
import { logout } from "@/app/actions/auth";

export default async function StudentHome() {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") return null;
  const { student } = user;

  const items = await db.journalItem.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    include: { skills: { select: { id: true, name: true } } },
  });

  const published = items.filter((i) => i.status === "APPROVED");
  const inProgress = items.filter((i) => i.status !== "APPROVED");

  // How many assigned activities are still to do?
  const assignedIds = (
    await db.activityAssignment.findMany({
      where: { studentId: student.id },
      select: { activityId: true },
    })
  ).map((a) => a.activityId);
  const respondedIds = new Set(
    (
      await db.journalItem.findMany({
        where: { studentId: student.id, activityId: { not: null } },
        select: { activityId: true },
      })
    ).map((r) => r.activityId),
  );
  const todoCount = assignedIds.filter((id) => !respondedIds.has(id)).length;

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center gap-3 p-4">
          <Avatar name={student.name} color={student.avatarColor} size={48} />
          <div className="flex-1">
            <p className="text-lg font-bold">{student.name}</p>
            <p className="text-sm text-muted">{student.className}</p>
          </div>
          <form action={logout}>
            <button className="btn-ghost px-3 py-1.5 text-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <Link
          href="/student/activities"
          className="card mb-3 flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="text-2xl">📝</span>
          <span className="flex-1 font-bold">My activities</span>
          {todoCount > 0 ? (
            <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-sm font-bold text-amber-950">
              {todoCount} to do
            </span>
          ) : (
            <span className="text-sm text-muted">All done</span>
          )}
        </Link>

        <Link href="/student/new" className="btn-green mb-6 w-full py-5 text-xl">
          ＋ Add to my journal
        </Link>

        {inProgress.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              Waiting &amp; sent back
            </h2>
            <div className="space-y-4">
              {inProgress.map((item) => (
                <JournalItemCard key={item.id} item={item} showStatus />
              ))}
            </div>
          </section>
        )}

        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
          My journal
        </h2>
        {published.length === 0 ? (
          <div className="card p-10 text-center text-muted">
            <div className="text-4xl">🌱</div>
            <p className="mt-2 font-semibold text-foreground">
              Your journal is empty
            </p>
            <p className="text-sm">Add your first piece of work above!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {published.map((item) => (
              <JournalItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
