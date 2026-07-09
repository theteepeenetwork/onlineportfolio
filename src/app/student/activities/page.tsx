import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { logout } from "@/app/actions/auth";

export default async function StudentActivities() {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") return null;
  const { student } = user;

  const assignments = await db.activityAssignment.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    include: { activity: { select: { id: true, title: true, instructions: true } } },
  });

  // Which activities has this child already responded to?
  const responded = new Set(
    (
      await db.journalItem.findMany({
        where: { studentId: student.id, activityId: { not: null } },
        select: { activityId: true },
      })
    ).map((r) => r.activityId),
  );

  const todo = assignments.filter((a) => !responded.has(a.activity.id));
  const doneList = assignments.filter((a) => responded.has(a.activity.id));

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center gap-3 p-4">
          <Avatar name={student.name} color={student.avatarColor} size={48} />
          <div className="flex-1">
            <p className="text-lg font-bold">{student.name}</p>
            <p className="text-sm text-muted">{student.className}</p>
          </div>
          <Link href="/student" className="btn-ghost px-3 py-1.5 text-sm">
            My journal
          </Link>
          <form action={logout}>
            <button className="btn-ghost px-3 py-1.5 text-sm" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <h1 className="mb-3 text-2xl font-bold">My activities</h1>

        {assignments.length === 0 && (
          <div className="card p-10 text-center text-muted">
            <div className="text-4xl">🎈</div>
            <p className="mt-2 font-semibold text-foreground">Nothing to do right now</p>
            <p className="text-sm">Your teacher will set activities here.</p>
          </div>
        )}

        {todo.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">To do</h2>
            <div className="space-y-3">
              {todo.map((a) => (
                <Link
                  key={a.id}
                  href={`/student/activities/${a.activity.id}`}
                  className="card flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="text-2xl">📝</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{a.activity.title}</p>
                    {a.activity.instructions && (
                      <p className="truncate text-sm text-muted">{a.activity.instructions}</p>
                    )}
                  </div>
                  <span className="btn-green px-3 py-1.5 text-sm">Start</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {doneList.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Done</h2>
            <div className="space-y-2">
              {doneList.map((a) => (
                <div key={a.id} className="card flex items-center gap-3 p-4 opacity-70">
                  <span className="text-2xl">✅</span>
                  <p className="flex-1 truncate font-semibold">{a.activity.title}</p>
                  <span className="text-sm text-muted">Handed in</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
