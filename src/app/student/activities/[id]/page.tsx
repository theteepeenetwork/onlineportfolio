import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonArray } from "@/lib/activities";
import { readQuiz } from "@/lib/quiz";
import { readTemplateObjects } from "@/lib/canvasObjects";
import { ActivityResponseForm } from "./ActivityResponseForm";

export default async function RespondToActivity({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") return null;
  const { id } = await params;

  // The run (assignment) must be live and assigned to this child.
  const assignment = await db.assignment.findFirst({
    where: {
      id,
      status: "LIVE",
      OR: [
        { wholeClass: true, classId: user.student.classId },
        { wholeClass: false, students: { some: { studentId: user.student.id } } },
      ],
    },
  });
  if (!assignment) notFound();

  // Already handed in and not yet sent back? Go to their journal. A RETURNED
  // item means the teacher asked for another go, so the child may reopen the
  // activity and re-submit (createJournalItem updates that item in place).
  const existing = await db.journalItem.findFirst({
    where: { assignmentId: id, studentId: user.student.id, status: { not: "RETURNED" } },
  });
  if (existing) redirect("/student");

  return (
    <ActivityResponseForm
      assignmentId={assignment.id}
      studentId={user.student.id}
      title={assignment.title}
      instructions={assignment.instructions ?? undefined}
      template={jsonArray(assignment.templateSnapshotJson)}
      quiz={readQuiz(assignment.quizSnapshotJson)}
      objects={readTemplateObjects(assignment.objectsSnapshotJson).pages}
    />
  );
}
