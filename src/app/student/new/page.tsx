import Link from "next/link";
import { CreateForm } from "@/components/CreateForm";

export default function StudentNewPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4">
      <Link href="/student" className="text-sm text-muted hover:text-foreground">
        ← Back to my journal
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold">Add to my journal</h1>
      <p className="mb-5 text-muted">
        Show your thinking with a photo, your words, or a drawing.
      </p>
      <CreateForm mode="student" />
    </main>
  );
}
