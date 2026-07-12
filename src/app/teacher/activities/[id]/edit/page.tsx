import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonArray } from "@/lib/activities";
import { readQuiz } from "@/lib/quiz";
import { ActivityBuilder } from "../../new/ActivityBuilder";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { id } = await params;

  // Scoped to this teacher — another school's template must 404, not load.
  const template = await db.activityTemplate.findFirst({
    where: { id, teacherId: user.teacher.id },
  });
  if (!template) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4">
      <Link href={`/teacher/activities/${template.id}`} className="text-sm text-muted hover:text-foreground">
        ← Back to activity
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold">Edit activity</h1>
      <p className="mb-5 text-muted">
        Change the title, instructions, or the template canvas. Saving also
        updates any class working on it right now.
      </p>
      <ActivityBuilder
        teacherId={user.teacher.id}
        template={{
          id: template.id,
          title: template.title,
          instructions: template.instructions ?? "",
          tags: jsonArray(template.tagsJson),
          pages: jsonArray(template.templatePathsJson),
          quiz: readQuiz(template.quizJson),
        }}
      />
    </main>
  );
}
