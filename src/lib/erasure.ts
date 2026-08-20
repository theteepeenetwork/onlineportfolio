import "server-only";
import { db } from "@/lib/db";
import { deleteMediaFiles } from "@/lib/media";

// ===========================================================================
// Erasure: the one place that knows how to delete a thing COMPLETELY.
//
// SAFEGUARDING.md rule 9: "When a school, class, child or moment is deleted,
// the database rows and the underlying media files are removed. Right to
// erasure (UK GDPR Art. 17) must actually erase." RETENTION.md principle 3
// says the same thing about the cascade, and adds the family space: "A family
// space goes when its last linked child does, taking its sessions and sign-in
// tokens with it."
//
// THE ORDERING CONSTRAINT, which is why this module exists at all.
//
//   Media paths must be GATHERED BEFORE THE ROWS GO.
//
// A media file's only name is the string stored in the row that points at it:
// `JournalItem.mediaPath`, an entry in `JournalItem.mediaPathsJson`, or an
// entry in `Draft.pagesJson`. Once the row is deleted there is no way back to
// the filename, so the file is stranded on the volume for ever with nothing
// left that can find it. Nothing fails, nothing logs, no test goes red: a
// child's drawing simply stays on disk after a school asked for it to be gone.
// The same is true of parent ids: the parent-child link rows vanish with the
// pupil, so the ids of the families that might now be orphaned have to be read
// out before the delete, not after.
//
// Every entry point below therefore does the three steps in one visible place,
// in this order: gather, delete rows, delete files (then sweep orphaned
// families). Keeping them in one function is the point. A caller that gathers
// its own paths is a caller that can forget one, and that is exactly how this
// logic drifted into four near-copies before this module existed.
//
// Media paths live in FOUR shapes, and a path that handles only the first
// loses files silently:
//   1. `JournalItem.mediaPath`      one path, or null
//   2. `JournalItem.mediaPathsJson` a JSON array of paths (multi-page drawings)
//   3. `JournalItem.previewPathsJson` a JSON array of paths (the picture of a
//      quiz page: the same pages with the question boxes drawn on)
//   4. `Draft.pagesJson`            a JSON array of paths (autosaved pages)
//
// AUTHORISATION IS THE CALLER'S JOB. These functions take an id and erase it.
// They deliberately do no ownership or tenancy check, because they are used
// from teacher-scoped actions that have already resolved the subject through
// an ownership-scoped query (SAFEGUARDING rules 4 and 8). Never call one with
// an id that came straight off a form.
//
// Erasure is never write-gated: a frozen (read-only) account can still delete,
// which is the right-to-erasure exception in RETENTION.md.
// ===========================================================================

// Parse a JSON string column that holds an array of /uploads paths. Malformed
// or absent JSON yields nothing to erase, which is the safe reading: a path we
// cannot parse is a path we never wrote.
export function mediaPathsFromJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

type ItemMedia = {
  mediaPath: string | null;
  mediaPathsJson: string | null;
  // Required, not optional, and deliberately so: a fourth shape of media path
  // is a fourth way to strand a child's file on the volume for ever. Making it
  // required means the compiler names every gather site that has not been told
  // about it, which is cheaper than finding out from a school.
  previewPathsJson: string | null;
};

// Every media file one journal item owns: the cover/voice-note path, every page
// of a multi-page drawing, and every page of the picture of it.
export function journalItemMediaPaths(item: ItemMedia): Array<string | null> {
  return [
    item.mediaPath,
    ...mediaPathsFromJson(item.mediaPathsJson),
    ...mediaPathsFromJson(item.previewPathsJson),
  ];
}

function journalItemsMediaPaths(items: ItemMedia[]): Array<string | null> {
  return items.flatMap(journalItemMediaPaths);
}

type DraftPages = { pagesJson: string | null };

// Every media file a set of drafts owns (autosaved composite pages).
export function draftMediaPaths(drafts: DraftPages[]): string[] {
  return drafts.flatMap((d) => mediaPathsFromJson(d.pagesJson));
}

// ---------------------------------------------------------------------------
// Family spaces left holding nothing
// ---------------------------------------------------------------------------

// A Parent row is not an account somebody keeps: it exists only to hold the link
// between one household and their child(ren). The moment the last link goes,
// because a teacher removed the family's access, or removed the pupil, or
// deleted the class, the row is a dangling credential. It still has a working
// family code and it may still have live sessions, so leaving it behind is not
// merely untidy: it is an unowned way in.
//
// RETENTION.md promises "deleted when last linked child is deleted", and rule 9
// says erasure must be real. Deleting the Parent row cascades its sessions and
// its magic tokens (see the schema), so nothing of the family survives it.
//
// Call it AFTER the link (or the child, or the class) has gone, with the ids
// gathered BEFORE: once the join rows are removed there is no way back to them.
// The `children: { none: {} }` guard is what makes it safe to pass every parent
// id you gathered — a family that still has another child linked is left alone.
export async function deleteOrphanedParents(parentIds: string[]): Promise<number> {
  const unique = [...new Set(parentIds.filter(Boolean))];
  if (unique.length === 0) return 0;

  const { count } = await db.parent.deleteMany({
    where: { id: { in: unique }, children: { none: {} } },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Entry points, one per erasable thing
// ---------------------------------------------------------------------------

// One moment: the row and every file it owns.
export async function eraseJournalItem(itemId: string): Promise<void> {
  const item = await db.journalItem.findUnique({
    where: { id: itemId },
    select: { mediaPath: true, mediaPathsJson: true, previewPathsJson: true },
  });
  if (!item) return;

  const mediaUrls = journalItemMediaPaths(item);

  await db.journalItem.delete({ where: { id: itemId } });
  await deleteMediaFiles(mediaUrls);
}

// A superseded attempt's files, with no row deletion. Used when a child re-does
// a handed-back activity: the RETURNED item is updated in place to point at the
// new capture, so the previous attempt's files would otherwise be stranded.
export async function eraseJournalItemMedia(item: ItemMedia): Promise<void> {
  await deleteMediaFiles(journalItemMediaPaths(item));
}

// One pupil: their row (which cascades their moments, drafts, sessions and
// assignment links), every media file those referenced, and any family space
// left linked to no child at all.
export async function eraseStudent(studentId: string): Promise<void> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: {
      journalItems: { select: { mediaPath: true, mediaPathsJson: true, previewPathsJson: true } },
      drafts: { select: { pagesJson: true } },
      // Gathered BEFORE the delete: once the pupil goes, so do the link rows
      // that would tell us which families were reading this child.
      parents: { select: { id: true } },
    },
  });
  if (!student) return;

  const mediaUrls: Array<string | null> = [
    ...journalItemsMediaPaths(student.journalItems),
    ...draftMediaPaths(student.drafts),
  ];
  const parentIds = student.parents.map((p) => p.id);

  await db.student.delete({ where: { id: studentId } });
  await deleteMediaFiles(mediaUrls);
  await deleteOrphanedParents(parentIds);
}

// A whole class: the row (which cascades its pupils, their moments, drafts and
// assignments), every media file those referenced, and any family space left
// linked to no child at all.
export async function eraseClass(classId: string): Promise<void> {
  const klass = await db.class.findUnique({
    where: { id: classId },
    select: {
      journalItems: { select: { mediaPath: true, mediaPathsJson: true, previewPathsJson: true } },
      drafts: { select: { pagesJson: true } }, // in-progress response drafts
      // Gathered BEFORE the delete: the parent-child links vanish with the
      // pupils, and an unlinked family row is a working code owned by nobody.
      students: { select: { parents: { select: { id: true } } } },
    },
  });
  if (!klass) return;

  const mediaUrls: Array<string | null> = [
    ...journalItemsMediaPaths(klass.journalItems),
    ...draftMediaPaths(klass.drafts),
  ];
  const parentIds = klass.students.flatMap((s) => s.parents.map((p) => p.id));

  await db.class.delete({ where: { id: classId } });
  await deleteMediaFiles(mediaUrls);
  await deleteOrphanedParents(parentIds);
}

// A set of draft rows and their autosaved pages. Drafts are erased from several
// places (lazy retention purge, submit/approve, a child discarding their own),
// each of which has already resolved WHICH drafts through its own owner-scoped
// query; this is the shared "rows and files together" half.
export async function eraseDrafts(drafts: Array<{ id: string } & DraftPages>): Promise<void> {
  if (drafts.length === 0) return;

  const mediaUrls = draftMediaPaths(drafts);

  await db.draft.deleteMany({ where: { id: { in: drafts.map((d) => d.id) } } });
  await deleteMediaFiles(mediaUrls);
}
