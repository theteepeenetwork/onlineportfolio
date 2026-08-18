"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requireWritableAccount } from "@/lib/billing";
import { copySharedMediaForTeacher } from "@/lib/sharedActivities";

// The ONLY action the shared library has, and it only ever reads the shared
// table and writes the teacher's own.
//
// There is deliberately no create, no update, no publish and no delete here.
// Publishing is scripts/ops/publish-shared-activities.mjs, in the repository,
// reviewable in a pull request. A publish action reachable from a teacher's
// session is how a curated library becomes user-generated content by accident,
// which the owner explicitly deferred. That absence is asserted rather than
// trusted, in tests/battery/security/shared-activities.spec.ts.
export async function addSharedActivityToLibrary(formData: FormData) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  // Adding is a write, so it respects the account freeze exactly as every other
  // write action does.
  if (!(await requireWritableAccount()).ok) redirect("/teacher/account?frozen=1");

  const sharedActivityId = String(formData.get("sharedActivityId") ?? "");

  // `published: true` is part of the WHERE, not a check afterwards. An
  // unpublished activity is not merely hidden from the browse screen: it cannot
  // be added by a request that names its id directly, which is the shape of the
  // only attack this action has.
  const shared = await db.sharedActivity.findFirst({
    where: { id: sharedActivityId, published: true },
  });
  if (!shared) redirect("/teacher/activities/shared");

  // Already added? Send them to the copy they have rather than making a second.
  const existing = await db.activityTemplate.findFirst({
    where: { teacherId: user.teacher.id, sourceSharedActivityId: shared.id },
    select: { id: true },
  });
  if (existing) redirect(`/teacher/activities/${existing.id}`);

  // The files first: if copying fails, no half-made template is left behind.
  const media = await copySharedMediaForTeacher({
    templatePathsJson: shared.templatePathsJson,
    quizJson: shared.quizJson,
    objectsJson: shared.objectsJson,
  });

  const copy = await db.activityTemplate.create({
    data: {
      title: shared.title,
      instructions: shared.instructions,
      templatePathsJson: media.templatePathsJson,
      quizJson: media.quizJson,
      objectsJson: media.objectsJson,
      tagsJson: shared.tagsJson,
      teacherId: user.teacher.id,
      sourceSharedActivityId: shared.id,
    },
  });

  revalidatePath("/teacher/activities");
  revalidatePath("/teacher/activities/shared");
  redirect(`/teacher/activities/${copy.id}`);
}
