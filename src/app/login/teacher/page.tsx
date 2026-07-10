import Link from "next/link";
import { TeacherLoginForm } from "./form";

export default function TeacherLoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Back
        </Link>
        <div className="card mt-3 p-6">
          <h1 className="text-2xl font-bold">Teacher sign in</h1>
          <p className="mt-1 text-sm text-muted">Welcome back.</p>
          <TeacherLoginForm />
          <p className="mt-5 text-center text-sm text-muted">
            New here?{" "}
            <Link href="/signup/teacher" className="font-semibold text-brand hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
