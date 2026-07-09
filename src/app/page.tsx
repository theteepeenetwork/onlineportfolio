import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// Landing page: choose whether you're a teacher or a student.
export default async function Home() {
  const user = await getCurrentUser();
  if (user?.role === "TEACHER") redirect("/teacher");
  if (user?.role === "STUDENT") redirect("/student");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-2 text-5xl">📚</div>
        <h1 className="text-3xl font-extrabold sm:text-4xl">Class Journal</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          A place for every child to show their thinking — photos, drawings and
          their own words — all in one growing journal.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            href="/login/teacher"
            className="card flex flex-col items-center gap-2 p-8 transition-transform hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-4xl">🧑‍🏫</span>
            <span className="text-xl font-bold">I&apos;m a teacher</span>
            <span className="text-sm text-muted">Sign in with your email</span>
          </Link>

          <Link
            href="/login/student"
            className="card flex flex-col items-center gap-2 p-8 transition-transform hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-4xl">🧒</span>
            <span className="text-xl font-bold">I&apos;m a student</span>
            <span className="text-sm text-muted">Use your class code</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
