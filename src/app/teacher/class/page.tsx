import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { teacherNav } from "@/lib/teacherNav";
import { removeStudent } from "@/app/actions/roster";
import { AddStudentForm } from "./AddStudentForm";

export default async function ClassPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const classes = await db.class.findMany({
    where: { teacherId: user.teacher.id },
    orderBy: { createdAt: "asc" },
    include: { students: { orderBy: { name: "asc" } } },
  });

  const pendingCount = await db.journalItem.count({
    where: { status: "PENDING", class: { teacherId: user.teacher.id } },
  });

  return (
    <>
      <TopBar
        title="Your class"
        subtitle="Add children and share your class code so they can sign in."
        links={teacherNav(pendingCount)}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 p-4">
        {classes.map((c) => (
          <section key={c.id} className="card mb-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">{c.name}</h2>
              <div className="rounded-xl bg-brand/10 px-4 py-2 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand/70">
                  Class code
                </p>
                <p className="text-2xl font-extrabold tracking-widest text-brand">
                  {c.classCode}
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <AddStudentForm classId={c.id} />
            </div>

            <ul className="mt-4 divide-y divide-border">
              {c.students.length === 0 && (
                <li className="py-3 text-sm text-muted">No students yet.</li>
              )}
              {c.students.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={s.name} color={s.avatarColor} size={36} />
                  <Link
                    href={`/teacher/students/${s.id}`}
                    className="flex-1 font-semibold hover:text-brand"
                  >
                    {s.name}
                  </Link>
                  <form action={removeStudent}>
                    <input type="hidden" name="studentId" value={s.id} />
                    <button
                      type="submit"
                      className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-rose-50 hover:text-rose-600"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
