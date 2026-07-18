import "server-only";
import { db } from "@/lib/db";
import { normaliseClassCode } from "@/lib/classCodeChars";
import {
  clientIp,
  allowCodeLookup,
  recordCodeMiss,
  recordCodeHit,
} from "@/lib/rateLimit";

// The one throttled entry point for resolving a class code to its class + pupil
// roster — FINDINGS F16. Everything that turns a typed/scanned code into a
// roster MUST go through here, so the throttle can never be forgotten by a new
// caller (the login page's plain GET is exactly how it was missed before).
//
// A raw `code` string (already URL-decoded) goes in; the class with its pupils
// (name-sorted) comes back, or null. `null` covers three cases that are all
// indistinguishable to the caller on purpose — no code, an unknown code, and a
// throttled request all look the same, so a grinder learns nothing from the
// difference:
//   • empty/whitespace code            → null, no lookup, not counted
//   • over-budget key inside cooldown  → null, no lookup (the trickle gate)
//   • lookup ran and found nothing     → null, counted as a miss
// A real hit clears the key, keeping an honest classroom perpetually under
// budget (see rateLimit.ts for why a NAT'd school needs this).

type ClassWithPupils = Awaited<ReturnType<typeof lookupClassByCode>>;

export async function lookupClassByCode(rawCode: string | undefined) {
  const normalised = rawCode === undefined ? "" : normaliseClassCode(rawCode);
  if (!normalised) return null;

  // Key on the client IP — a school's NAT IP for real children, an attacker's
  // IP for a grinder. Verified un-spoofable on this edge (see clientIp()).
  const key = await clientIp();

  // Over budget and inside the trickle cooldown → refuse WITHOUT querying, so a
  // grind can't keep pulling rosters. Indistinguishable from "not found".
  if (!allowCodeLookup(key)) return null;

  const klass = await db.class.findUnique({
    where: { classCode: normalised },
    include: { students: { orderBy: { name: "asc" } } },
  });

  if (klass) {
    recordCodeHit(key); // a correct code clears the key and lifts any trickle
  } else {
    recordCodeMiss(key); // a wrong code counts toward the budget
  }
  return klass;
}

export type { ClassWithPupils };
