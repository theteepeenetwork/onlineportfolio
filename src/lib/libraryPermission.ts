import { db } from "@/lib/db";
import { ownMediaPathsIn } from "@/lib/mediaPath";

// The two decisions that stand between a teacher's canvas and StoryJar's
// published library: may this person publish at all, and is this particular
// activity made of things they own?
//
// WHY THIS IS ITS OWN MODULE, AND WHY IT HAS NO `server-only`
//
// The same reason src/lib/ops/enabled.ts and src/lib/ops/dto.ts do not: a
// blocking spec has to be able to import these and assert their behaviour
// directly, and a module carrying `server-only` throws the moment a Playwright
// test imports it.
//
// That is not a nicety here, it is the whole point. Both gates were originally
// written inside src/lib/libraryPublishing.ts, which does carry `server-only`,
// and a mutation test proved what that cost: with all three `canPublish` calls
// disabled, every runtime test in shared-activities.spec.ts still passed. They
// were passing because a spec cannot craft a Server Action request — Next
// rejects the payload before any of our code runs — not because anything was
// being stopped. A green test that survives the removal of the thing it is
// meant to protect is worse than no test, because somebody will trust it.
//
// So the decisions live here, where tests/battery/security/shared-activities.spec.ts
// calls them directly with real fixture ids and gets real answers.
//
// There is nothing secret in this file: two functions over a teacher id and a
// set of paths, both of which only ever return a verdict.

/**
 * May this teacher publish to StoryJar's library?
 *
 * Deny by default, and deliberately a question about the SCHOOL rather than the
 * person: a member of StoryJar staff is somebody signed in at StoryJar Academy,
 * and there is no per-teacher permission that could get out of step with
 * `School.canPublishToLibrary` — a column no screen writes, set only by
 * scripts/ops/seed-academy.mjs or a migration.
 *
 * A missing teacher, a teacher with no school, and a school with the column
 * null all deny, because the comparison is `=== true` and nothing else.
 */
export async function canPublish(teacherId: string): Promise<boolean> {
  const teacher = await db.teacher.findUnique({
    where: { id: teacherId },
    select: { school: { select: { canPublishToLibrary: true } } },
  });
  return teacher?.school?.canPublishToLibrary === true;
}

/** The three payload columns, which travel together everywhere. */
export type LibraryPayload = {
  templatePathsJson: string | null;
  quizJson: string | null;
  objectsJson: string | null;
};

/**
 * Why this activity may not be published, or null if it may.
 *
 * THE ONE CONTROL BETWEEN THE CANVAS AND A CHILD'S PHOTOGRAPH ON EVERY
 * TEACHER'S SCREEN.
 *
 * The three payload columns are client-controlled. `parsePages` in
 * src/app/actions/activities.ts, and `isAllowedImagePath` / `isAllowedImageSrc`
 * beside it, check the SHAPE of a path and nothing else: a string beginning
 * `/uploads/` is accepted whoever it belongs to. Without this, publishing would
 * copy the bytes of any such file into SHARED_MEDIA_DIR, which every signed-in
 * teacher in every tenant can read.
 *
 * The attack is short and needs nobody to be clever. A teacher opens their own
 * approval queue, where a pupil's photograph renders as
 * `<img src="/uploads/9f2c….png">`. They put that path in a template, publish,
 * and make it visible. The bytes are then served platform-wide — and because
 * nothing on that path consults `JournalItem.status`, a PENDING item no adult
 * has approved would go out with the rest. That is exactly the bypass
 * SAFEGUARDING rule 3 forbids: "no auto-publish and no bypass".
 *
 * What made it survivable before this existed was not a control: the Academy's
 * pupils are fictional and the flag is Academy-only. Both are facts about a seed
 * script. This makes "the library holds no child data" a property of the code,
 * which matters because RETENTION.md states it as a fact.
 *
 * The refusal names no record — it says a pupil's work is referenced, never
 * whose or which.
 */
export async function publishRefusal(
  teacherId: string,
  payload: LibraryPayload,
): Promise<string | null> {
  const paths = ownMediaPathsIn(payload.templatePathsJson, payload.quizJson, payload.objectsJson);
  if (paths.length === 0) return null;

  // Any child's work, at any status. APPROVED is not a licence either: approval
  // decides what a class and its families see inside StoryJar (rule 3), and has
  // never meant "publishable to every school in the country".
  const childItem = await db.journalItem.findFirst({
    where: {
      OR: paths.flatMap((p) => [
        { mediaPath: p },
        { mediaPathsJson: { contains: p } },
        { previewPathsJson: { contains: p } },
      ]),
    },
    select: { id: true },
  });
  if (childItem) {
    return "That activity points at a pupil's work. Rebuild the page with your own picture before publishing it.";
  }

  // A child's own in-progress drawing, which is theirs alone and has not even
  // reached a teacher yet.
  const childDraft = await db.draft.findFirst({
    where: { studentId: { not: null }, OR: paths.map((p) => ({ pagesJson: { contains: p } })) },
    select: { id: true },
  });
  if (childDraft) {
    return "That activity points at a pupil's unfinished work. Rebuild the page with your own picture before publishing it.";
  }

  // Somebody else's template. Not child data, and still not ours to publish.
  // FINDINGS F27 means a duplicated template shares path strings, so one file
  // can legitimately sit on two templates — but never on two teachers'.
  const otherTeacher = await db.activityTemplate.findFirst({
    where: {
      teacherId: { not: teacherId },
      OR: paths.flatMap((p) => [
        { templatePathsJson: { contains: p } },
        { previewPathsJson: { contains: p } },
        { quizJson: { contains: p } },
        { objectsJson: { contains: p } },
      ]),
    },
    select: { id: true },
  });
  if (otherTeacher) {
    return "That activity points at a picture from somebody else's activity. Rebuild the page with your own before publishing it.";
  }

  return null;
}
