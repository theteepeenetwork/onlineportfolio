import Link from "next/link";
import { db } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { studentLogin } from "@/app/actions/auth";

// Step 1: the child (or teacher) types the class code -> ?code=XXX.
// Step 2: we show the class's students and they tap their own name.
export default async function StudentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const normalised = code?.trim().toUpperCase();

  const klass = normalised
    ? await db.class.findUnique({
        where: { classCode: normalised },
        include: { students: { orderBy: { name: "asc" } } },
      })
    : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Back
        </Link>

        {!klass ? (
          <div className="card mt-3 p-6">
            <h1 className="text-2xl font-bold">Enter your class code</h1>
            <p className="mt-1 text-sm text-muted">
              Your teacher will show you the code.
            </p>
            <form method="get" className="mt-5 space-y-4">
              <input
                className="input text-center text-2xl font-bold tracking-widest uppercase"
                name="code"
                placeholder="ABC123"
                autoFocus
                autoComplete="off"
                aria-label="Class code"
              />
              {normalised && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  We couldn&apos;t find a class with that code. Try again.
                </p>
              )}
              <button className="btn-brand w-full" type="submit">
                Next
              </button>
            </form>
          </div>
        ) : (
          <div className="card mt-3 p-6">
            <h1 className="text-2xl font-bold">{klass.name}</h1>
            <p className="mt-1 text-sm text-muted">Tap your name.</p>

            {klass.students.length === 0 ? (
              <p className="mt-6 text-muted">
                No students yet — ask your teacher to add you.
              </p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {klass.students.map((s) => (
                  <form key={s.id} action={studentLogin}>
                    <input type="hidden" name="studentId" value={s.id} />
                    <button
                      type="submit"
                      className="card flex w-full flex-col items-center gap-2 p-4 transition-transform hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <Avatar name={s.name} color={s.avatarColor} size={56} />
                      <span className="font-semibold">{s.name}</span>
                    </button>
                  </form>
                ))}
              </div>
            )}

            <Link
              href="/login/student"
              className="mt-5 inline-block text-sm text-muted hover:text-foreground"
            >
              ← Wrong class? Enter a different code
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
