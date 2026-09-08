// ===========================================================================
// Permission slips: the answers StoryJar allows, and nothing else.
//
// NO `server-only`, deliberately, and the same reason `officeHours.ts` has none:
// the form a parent answers on and the action that records the answer must read
// the same list, so what the screen offers and what the server accepts cannot
// drift apart. The action is still the enforcement point; a form is a
// convenience.
//
// ---------------------------------------------------------------------------
// WHY THE SCHOOL DOES NOT WRITE THESE.
// ---------------------------------------------------------------------------
//
// SAFEGUARDING rule 19 ends: "A tag that records something about the CHILD — SEN
// status, a diagnosis, a health need, ethnicity, religion — is special category
// data and does not belong in StoryJar." Rule 21 refused absence and illness
// reporting on the same ground.
//
// A permission slip is where that line gets crossed by accident rather than by
// argument. Let a school type its own answer labels and within a term somebody
// writes "Does your child have a nut allergy? Yes / No" — and StoryJar is
// processing health data about children, which flips the answer to the ICO's
// registration question, makes a DPO mandatory under Art. 37(1)(c), and needs a
// new DPIA before any of it ships. Rule 19 spells that cost out precisely
// because the feature that crosses it always sounds harmless.
//
// So: the school writes the QUESTION. StoryJar owns the ANSWERS. There is no
// free-text field on a response anywhere in the product, and adding one is the
// change this file exists to make somebody argue for.
//
// THE ONE EXTRA ANSWER, and why it is not a dietary record. A school taking a
// class out for the day needs to know which free-school-meals children want a
// packed lunch provided rather than bringing their own. That is a CATERING
// HEADCOUNT for one day — how many lunches to make — and it says nothing about
// what a child may or may not eat. It is asked only when the school switches it
// on for that form, and it is a boolean with no room to elaborate (owner
// decision, 8 September 2026).
// ===========================================================================

export const CONSENT_ANSWERS = ["GIVEN", "NOT_GIVEN"] as const;
export type ConsentAnswer = (typeof CONSENT_ANSWERS)[number];

/** The words a parent reads. Even-handed, and neither is pre-selected. */
export const CONSENT_ANSWER_LABEL: Record<ConsentAnswer, string> = {
  GIVEN: "I give permission",
  NOT_GIVEN: "I do not give permission",
};

/** The packed-lunch question, in the words a parent sees. */
export const PACKED_LUNCH_LABEL = "My child needs a packed lunch provided";

/**
 * The standing line on every form, and the reason there is no box to type in.
 *
 * Shown to the parent under the answers and to the school in the builder, so
 * both sides are told the same thing in the same words.
 */
export const CONSENT_OFFICE_LINE =
  "If you need to tell the school about a medical need, a dietary need, or anything about how your child is " +
  "looked after, please phone the school office. Those things are not asked for or kept here.";

/** Narrow an untrusted value to an answer, or null. Never guesses. */
export function normaliseAnswer(value: unknown): ConsentAnswer | null {
  return value === "GIVEN" || value === "NOT_GIVEN" ? value : null;
}

export type ConsentTally = { answered: number; given: number; notGiven: number; packedLunch: number; waiting: number };

/**
 * What a register shows: how many have answered, which way, and how many are
 * still outstanding.
 *
 * Pure, so the same sums are shown to a teacher and to the admin who sent the
 * form, and a disagreement between the two screens is impossible rather than
 * unlikely.
 */
export function tally(
  responses: Array<{ answer: string; packedLunch: boolean }>,
  childrenInvited: number,
): ConsentTally {
  const given = responses.filter((r) => r.answer === "GIVEN").length;
  const notGiven = responses.filter((r) => r.answer === "NOT_GIVEN").length;
  const packedLunch = responses.filter((r) => r.packedLunch).length;
  return {
    answered: responses.length,
    given,
    notGiven,
    packedLunch,
    // Never negative, even if a child left the class after answering.
    waiting: Math.max(0, childrenInvited - responses.length),
  };
}
