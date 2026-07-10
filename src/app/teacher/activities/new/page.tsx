import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ActivityBuilder } from "./ActivityBuilder";

export default async function NewTemplatePage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4">
      <Link href="/teacher/activities" className="text-sm text-muted hover:text-foreground">
        ← Back to library
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold">New template</h1>
      <p className="mb-5 text-muted">
        Build a reusable template. You&apos;ll assign it to a class next.
      </p>
      <ActivityBuilder />
    </main>
  );
}
