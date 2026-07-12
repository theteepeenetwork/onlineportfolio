import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { logout } from "@/app/actions/auth";
import { Icon } from "@/components/icons/Icon";

export default async function StudentActivities() {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") return null;
  const { student } = user;

  // Live runs assigned to this child: whole-class runs for their class, or
  // pick-children runs they were chosen for.
  const assignments = await db.assignment.findMany({
    where: {
      status: "LIVE",
      OR: [
        { wholeClass: true, classId: student.classId },
        { wholeClass: false, students: { some: { studentId: student.id } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, instructions: true },
  });

  // Which runs has this child already handed in?
  const responded = new Set(
    (
      await db.journalItem.findMany({
        where: { studentId: student.id, assignmentId: { not: null } },
        select: { assignmentId: true },
      })
    ).map((r) => r.assignmentId),
  );

  const todo = assignments.filter((a) => !responded.has(a.id));
  const doneList = assignments.filter((a) => responded.has(a.id));

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
                  href={`/student/activities/${a.id}`}
                  className="card flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Icon name="add-file" size={26} decorative />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{a.title}</p>
                    {a.instructions && (
                      <p className="truncate text-sm text-muted">{a.instructions}</p>
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
                  <Icon name="done" size={26} decorative />
                  <p className="flex-1 truncate font-semibold">{a.title}</p>
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
