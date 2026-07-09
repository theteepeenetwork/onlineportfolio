import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { teacherNav } from "@/lib/teacherNav";

export default async function TeacherDashboard() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const classes = await db.class.findMany({
    where: { teacherId: user.teacher.id },
    orderBy: { createdAt: "asc" },
    include: {
      students: {
        orderBy: { name: "asc" },
        include: {
          _count: { select: { journalItems: true } },
          journalItems: { select: { status: true } },
        },
      },
    },
  });

  const pendingCount = classes.reduce(
    (sum, c) =>
      sum +
      c.students.reduce(
        (s, st) => s + st.journalItems.filter((i) => i.status === "PENDING").length,
        0,
      ),
    0,
  );

  return (
    <>
      <TopBar
        title={`Hello, ${user.teacher.name.split(" ")[0]} 👋`}
        subtitle="Choose a child to see their journal, or check what's waiting for you."
        links={teacherNav(pendingCount)}
        right={
          <Link href="/teacher/activities/new" className="btn-brand px-3 py-1.5 text-sm">
            ＋ New activity
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        {classes.length === 0 && (
          <div className="card p-8 text-center text-muted">
            You don&apos;t have a class yet.
          </div>
        )}

        {classes.map((c) => (
          <section key={c.id} className="mb-8">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold">{c.name}</h2>
              <span className="rounded-lg bg-brand/10 px-2.5 py-1 text-sm font-semibold text-brand">
                Class code: {c.classCode}
              </span>
              <Link
                href="/teacher/class"
                className="text-sm font-semibold text-muted hover:text-foreground"
              >
                Manage class →
              </Link>
            </div>

            {c.students.length === 0 ? (
              <div className="card p-6 text-center text-muted">
                No students yet.{" "}
                <Link href="/teacher/class" className="font-semibold text-brand">
                  Add some
                </Link>
                .
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {c.students.map((s) => {
                  const pending = s.journalItems.filter(
                    (i) => i.status === "PENDING",
                  ).length;
                  const published = s.journalItems.filter(
                    (i) => i.status === "APPROVED",
                  ).length;
                  return (
                    <Link
                      key={s.id}
                      href={`/teacher/students/${s.id}`}
                      className="card flex items-center gap-3 p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <Avatar name={s.name} color={s.avatarColor} size={48} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{s.name}</p>
                        <p className="text-sm text-muted">
                          {published} in journal
                          {pending > 0 && (
                            <span className="ml-1 font-semibold text-amber-600">
                              · {pending} waiting
                            </span>
                          )}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
