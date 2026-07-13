import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonArray } from "@/lib/activities";
import { readQuiz } from "@/lib/quiz";
import { readTemplateObjects } from "@/lib/canvasObjects";
import { TemplatePreview } from "./TemplatePreview";

export default async function PreviewTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { id } = await params;

  // Scoped to this teacher — another school's template must 404, not preview.
  const template = await db.activityTemplate.findFirst({
    where: { id, teacherId: user.teacher.id },
  });
  if (!template) notFound();

  return (
    <TemplatePreview
      templateId={template.id}
      title={template.title}
      instructions={template.instructions ?? undefined}
      pages={jsonArray(template.templatePathsJson)}
      quiz={readQuiz(template.quizJson)}
      objects={readTemplateObjects(template.objectsJson).pages}
    />
  );
}
