import "server-only";
import { db } from "@/lib/db";

// Erasure for a parent who is no longer linked to any child.
//
// A Parent row is not an account somebody keeps: it exists only to hold the link
// between one household and their child(ren). The moment the last link goes, because
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
export async function deleteOrphanedParents(parentIds: string[]): Promise<number> {
  const unique = [...new Set(parentIds.filter(Boolean))];
  if (unique.length === 0) return 0;

  const { count } = await db.parent.deleteMany({
    where: { id: { in: unique }, children: { none: {} } },
  });
  return count;
}
