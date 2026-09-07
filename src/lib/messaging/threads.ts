import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deliveryTimeFor, hasAnyOpening, type Policy } from "./officeHours";

// ===========================================================================
// Parent–teacher message threads: the ONLY module that reads or writes
// MessageThread, Message and MessageThreadShare.
//
// SAFEGUARDING.md rule 21. Two things are enforced here and nowhere else, which
// is why nothing else may touch these tables (scripts/audit-static.mjs checks):
//
//   1. THE HOLD. A message is never delivered outside the school's office
//      hours, in either direction. `deliverAt` is computed at insert from the
//      school's policy, and every read a RECIPIENT gets filters on it. The
//      sender always sees their own message, labelled with when it lands.
//      Time passing is the only thing that delivers a message: no job, no cron.
//
//   2. WHO IS IN THE ROOM. A thread is about one child. Its readers are the
//      child's linked parents (rule 4: the parent↔child link), the class
//      teacher via Class.teacherId — unless the teacher has passed the family
//      to a handler — the handler, and any colleague the thread was shared
//      with, each only while still staff of the thread's school. No child
//      session reaches any of this. No admin reads a body (rule 5).
// ===========================================================================

/**
 * Where an undelivered message waits when nothing can deliver it: the school
 * has switched messaging off, or has no office hours at all. Recomputed the
 * moment the policy changes, so this is a parking place, not a destination.
 */
export const HELD_INDEFINITELY = new Date("9999-12-31T00:00:00.000Z");

/**
 * The hard rule, applied to every message in a school that has not yet been
 * delivered, inside the transaction that changed the school's policy. A school
 * that narrows its hours after a message was held would otherwise deliver it
 * outside the new window; a school that widens them would otherwise keep a
 * parent waiting for an opening that has already happened.
 *
 * Recomputed from `createdAt`, never from the old `deliverAt`, so the answer
 * is the one the new policy gives to the moment the message was written.
 * `policy` null means messaging is off or has no opening: everything waiting is
 * parked at HELD_INDEFINITELY until the policy changes again.
 */
export async function recomputeHeldDeliveries(
  tx: Prisma.TransactionClient,
  schoolId: string,
  policy: Policy | null,
  now: Date = new Date(),
): Promise<number> {
  const waiting = await tx.message.findMany({
    where: { deliverAt: { gt: now }, thread: { schoolId } },
    select: { id: true, createdAt: true },
  });
  if (waiting.length === 0) return 0;
  const usable = policy && hasAnyOpening(policy) ? policy : null;
  for (const m of waiting) {
    const when = usable ? deliveryTimeFor(m.createdAt, usable) : null;
    await tx.message.update({ where: { id: m.id }, data: { deliverAt: when ?? HELD_INDEFINITELY } });
  }
  return waiting.length;
}

// A default export is deliberately absent: importing `db` here is the one
// permitted use of the message tables, and a caller that wants a thread asks
// for it through the scoped readers below.
export { db as _messagingDb };
