import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";

export default async function ActivitiesPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [activities, pendingCount] = await Promise.all([
    db.activity.findMany({
      where: { teacherId: user.teacher.id },
      orderBy: { createdAt: "desc" },
      include: {
        class: { select: { name: true } },
        _count: { select: { assignments: true, responses: true } },
      },
    }),
    db.journalItem.count({
      where: { status: "PENDING", class: { teacherId: user.teacher.id } },
    }),
  ]);

  return (
    <>
      <TopBar
        title="Activities"
        subtitle="Set tasks for your class and see everyone's responses in one place."
        links={teacherNav(pendingCount)}
        right={
          <Link href="/teacher/activities/new" className="btn-brand px-3 py-1.5 text-sm">
            ＋ New activity
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-3xl flex-1 p-4">
        {activities.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-4xl">📝</div>
            <p className="mt-2 font-semibold">No activities yet</p>
            <p className="text-sm text-muted">
              Create one to set a task for your class.
            </p>
            <Link href="/teacher/activities/new" className="btn-brand mt-4">
              ＋ New activity
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <Link
                key={a.id}
                href={`/teacher/activities/${a.id}`}
                className="card flex items-center gap-4 p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-lg font-bold">{a.title}</p>
                  <p className="text-sm text-muted">
                    {a.class.name} · assigned to {a._count.assignments}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-extrabold text-brand">
                    {a._count.responses}
                  </p>
                  <p className="text-xs text-muted">responses</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
