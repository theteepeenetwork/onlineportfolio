import Link from "next/link";
import { CreateForm } from "@/components/CreateForm";

type Tab = "PHOTO" | "TEXT" | "DRAWING";
const VALID: Tab[] = ["PHOTO", "TEXT", "DRAWING"];

export default async function StudentNewPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const defaultTab = VALID.includes(type as Tab) ? (type as Tab) : "PHOTO";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4">
      <Link href="/student" className="text-sm text-muted hover:text-foreground">
        ← Back to my jar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold">Add to my jar</h1>
      <p className="mb-5 text-muted">
        Show your thinking with a photo, your words, or a drawing.
      </p>
      <CreateForm mode="student" defaultTab={defaultTab} />
    </main>
  );
}
