import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TeacherSignupForm } from "./form";

export default async function TeacherSignupPage() {
  // Already signed in? Go to the dashboard.
  const user = await getCurrentUser();
  if (user?.role === "TEACHER") redirect("/teacher");
  if (user?.role === "STUDENT") redirect("/student");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Back
        </Link>
        <div className="card mt-3 p-6">
          <h1 className="text-2xl font-bold">Create a teacher account</h1>
          <p className="mt-1 text-sm text-muted">Set up your account to get started.</p>
          <TeacherSignupForm />
          <p className="mt-5 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link href="/login/teacher" className="font-semibold text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
