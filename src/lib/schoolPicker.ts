// ---------------------------------------------------------------------------
// What the school picker SAYS. Pure: no React, no Prisma, no `server-only`.
// ---------------------------------------------------------------------------
//
// The picker's copy lives here rather than inline in the component for the same
// reason the query's `where` lives in @/lib/establishmentSearch rather than in
// the action: the sentence a screen reader announces is the load-bearing part
// of this feature, and a sentence written inline can only be checked by driving
// a browser. Here it can be checked in forty milliseconds.
//
// It also keeps one property honest that is easy to lose. The picker has FOUR
// states, not three — too-short, results, no results, and the throttle saying
// "busy" — and every one of them has to end somewhere a teacher can still
// finish signing up. Having them in one file, side by side, is what makes it
// obvious when a new state is added without an exit.
//
// This module must never be imported by anything under the ops roots. It has no
// denied identifiers today, but it is signup vocabulary and an operator has no
// use for it. See @/lib/establishmentRegister for the split and its reason.
// ---------------------------------------------------------------------------

import { SEARCH_MIN_CHARS, type EstablishmentResult } from "@/lib/establishmentSearch";

/**
 * The four things the picker can be doing, named once.
 *
 * `busy` is the throttle's refusal and it is deliberately NOT called `error`.
 * `allowEstablishmentSearch` trickles rather than blocking — a caller over
 * budget is let through every couple of seconds — so this state is a pause, not
 * a wall, and the copy below has to sound like one.
 */
export type PickerState =
  | { kind: "idle" }
  | { kind: "too-short" }
  | { kind: "results"; items: EstablishmentResult[]; truncated: boolean }
  | { kind: "no-results"; query: string }
  | { kind: "busy" };

/**
 * The sentence the polite live region carries.
 *
 * POLITE, and the wording assumes it. An assertive region firing on every
 * keystroke is worse than no count at all (the same call as ActivitySearchBox),
 * so this is written to be heard a beat late and still make sense.
 *
 * Empty string for `idle` on purpose: an untouched field announces nothing.
 */
export function pickerAnnouncement(state: PickerState): string {
  switch (state.kind) {
    case "idle":
      return "";
    case "too-short":
      return `Type at least ${SEARCH_MIN_CHARS} characters to search for your school.`;
    case "results": {
      const n = state.items.length;
      const found = n === 1 ? "1 school found." : `${n} schools found.`;
      // The truncation is said as a fact and paired with the thing to DO about
      // it. "Showing 20 of many" with no instruction leaves a teacher scrolling
      // a list their school is not in.
      const more = state.truncated
        ? " That is as many as we show — type a little more to narrow it down."
        : "";
      return `${found} Use the up and down arrow keys to choose one.${more}`;
    }
    case "no-results":
      // Never "no results" on its own. The register is a snapshot and every
      // teacher outside England lands here by design, so the sentence has to
      // carry the way out with it.
      return `No schools in the register match “${state.query}”. Carry on typing your school's name — we will use exactly what you write.`;
    case "busy":
      return "We could not check the register just then. Carry on typing your school's name — we will use exactly what you write — or search again in a moment.";
  }
}

/**
 * What the teacher is told AFTER they pick one, on screen and out loud.
 *
 * The input only ever holds the school's NAME, because that is what the rest of
 * the product shows. The town and the postcode are what told them they had the
 * right St Cuthbert's, and they vanish from the input the moment the list
 * closes — so they are repeated here. Without this the picker's whole
 * disambiguating job is invisible one second after it is done.
 */
export function selectionSummary(label: string): string {
  return `Selected: ${label}. Not the right one? Keep typing to search again.`;
}
