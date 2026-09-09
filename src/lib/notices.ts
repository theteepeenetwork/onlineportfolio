// ===========================================================================
// Notices: the caps and the words, shared by the screen and the action.
//
// NO `server-only`, for the reason `consent.ts` and `officeHours.ts` have none:
// the composer a member of staff types into and the action that records it must
// agree about the caps, so what the screen allows and what the server accepts
// cannot drift apart. The action is still the enforcement point.
// ===========================================================================

export const NOTICE_MAX_TITLE = 120;
export const NOTICE_MAX_BODY = 2000;

export const NOTICE_AUDIENCES = ["SCHOOL", "CLASSES"] as const;
export type NoticeAudience = (typeof NOTICE_AUDIENCES)[number];

/** Narrow an untrusted value to an audience, or null. Never guesses. */
export function normaliseAudience(value: unknown): NoticeAudience | null {
  return value === "SCHOOL" || value === "CLASSES" ? value : null;
}

/**
 * The line every notice carries in the family space, and the reason there is
 * nothing to press. A notice is one-way by construction (SAFEGUARDING rule 24);
 * this tells a family where the two-way things are.
 */
export const NOTICE_NO_REPLY_LINE =
  "You can't reply to a notice. To contact the school, use the conversation under your child's name, " +
  "or phone the school office.";

/**
 * The line in every composer, and the one thing a sender is asked not to do. A
 * whole-school notice with a child's name in it is a disclosure to every other
 * family; the builder says so where the words are typed, because nothing can do
 * better than a warning here and the residual is recorded rather than argued
 * away (docs/DPIA.md, R22).
 */
export const NOTICE_NO_NAMES_LINE = "Don't name a child in a notice — it goes to every family you send it to.";

/** "the office" / "your class teacher", for the label a family reads. */
export function senderLabel(role: string, name: string): string {
  return role === "ADMIN" ? `${name} (school office)` : name;
}
