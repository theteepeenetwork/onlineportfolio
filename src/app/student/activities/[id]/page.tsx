import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActivityResponseForm } from "./ActivityResponseForm";

export default async function RespondToActivity({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") return null;
  const { id } = await params;

  // The activity must be assigned to this child.
  const assignment = await db.activityAssignment.findFirst({
    where: { activityId: id, studentId: user.student.id },
    include: { activity: true },
  });
  if (!assignment) notFound();

  const { activity } = assignment;

  // If they've already handed something in, send them to their journal.
  const existing = await db.journalItem.findFirst({
    where: { activityId: id, studentId: user.student.id },
  });
  if (existing) redirect("/student");

  const template = activity.templatePathsJson
    ? (JSON.parse(activity.templatePathsJson) as string[])
    : [];

  return (
    <ActivityResponseForm
      activityId={activity.id}
      title={activity.title}
      instructions={activity.instructions ?? undefined}
      template={template}
    />
  );
}
