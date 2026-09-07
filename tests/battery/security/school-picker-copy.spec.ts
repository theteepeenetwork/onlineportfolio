import { test, expect } from "@playwright/test";
import { pickerAnnouncement, type PickerState } from "@/lib/schoolPicker";

// ===========================================================================
// The school picker's two "we have nothing for you" sentences must stay TWO
// sentences.
//
// WHY THIS IS NOT A TEST ABOUT AN ERROR MESSAGE. The picker can fail to offer a
// school for two unrelated reasons, and they call for opposite responses:
//
//   no-results — the register really holds no such school. The snapshot is
//                behind, or the school is new, or the teacher is in Wales.
//                Typing the name as free text is the RIGHT answer.
//   busy       — the throttle refused, or the request never landed. StoryJar
//                does not know whether the school is there. Waiting a moment
//                and searching again is the right answer.
//
// If those two ever collapse into one apology, a teacher whose register could
// not be REACHED is told her school is not IN it. Her rational response is to
// type the name as free text — and free text instead of a URN is precisely the
// problem docs/school-identity.md exists to remove. So a copy edit that merged
// these would quietly undo the school-identity work, in a way no other test in
// the repository would notice: every single-state test would still pass, because
// each sentence would still be present, correct and reachable on its own.
//
// That is the whole reason this file exists, and it is why the property is
// asserted BETWEEN the states rather than within them.
//
// WHY IT IS IN THE SECURITY SUITE, beside school-mail-health.spec.ts. Both
// guard the same class of defect: a screen making a claim it is not entitled to
// make. There, telling a business manager email is fine when nothing was tried
// (F30). Here, telling a teacher a school does not exist when StoryJar did not
// manage to look. Neither is a layout bug and neither would be caught by axe.
//
// WHY IT ASSERTS CLAIMS AND NOT VERBATIM STRINGS. The exact wording is allowed
// to improve; the claims are not allowed to merge. Pinning the sentences
// literally would make every rewording a red gate and teach the next person to
// edit the test rather than think about it. What is pinned is that each sentence
// makes its OWN claim, does not make the other's, and carries the way out.
//
// No database, no browser, no server. `pickerAnnouncement` is a pure function of
// a state, split out of the component precisely so the sentence a screen reader
// announces can be checked in milliseconds. That the COMPONENT renders what this
// module returns is asserted elsewhere (a11y/school-picker.spec.ts and
// e2e/school-picker.spec.ts both compare rendered text against this function),
// so this file does not repeat it.
// ===========================================================================

const noResults = pickerAnnouncement({ kind: "no-results", query: "Bramblewick" });
const busy = pickerAnnouncement({ kind: "busy" });

/**
 * "There is no such school" — a claim about the REGISTER's contents.
 *
 * `find … school` is in here after this gate was checked against the wordings a
 * person would actually write. "We could not FIND that school" is the likeliest
 * single phrasing for the harmful merge, and it slipped through the first
 * version of this pattern: it reads to a teacher as "your school is not there",
 * but it is built from failure words, so it matched CLAIMS_FAILURE and nothing
 * objected. The distinction that matters is the OBJECT — failing to check the
 * REGISTER is honest, failing to find the SCHOOL is the absence claim wearing a
 * failure's clothes.
 */
const CLAIMS_ABSENCE = /\bno schools?\b|\bnothing\b|\bnot in\b|find (that|your|the|any) school/i;
/** "We did not manage to look" — a claim about StoryJar, not about the school. */
const CLAIMS_FAILURE = /could ?n[o']?t|unable|try again|search again|in a moment/i;
/** The free-text path, which both states have to leave open. */
const OFFERS_FREE_TEXT = /carry on typing|type it in|we will use exactly what you write/i;

test.describe("the picker's empty-handed states", () => {
  test("no-results and busy are not the same sentence", () => {
    // The baseline. Everything below says WHY they must differ; this says that
    // they do, and it is the assertion that fails first if somebody merges them.
    expect(
      busy,
      "the throttle's refusal and an empty register must not share one sentence — see the header",
    ).not.toBe(noResults);
  });

  test("no-results says the register has no such school, and does not blame a failure", () => {
    expect(noResults, "must state what was actually found: nothing").toMatch(CLAIMS_ABSENCE);
    expect(
      noResults,
      "an empty register is not a malfunction; saying so would send a teacher away to wait for nothing",
    ).not.toMatch(CLAIMS_FAILURE);
  });

  test("busy says StoryJar could not look, and never that the school is missing", () => {
    expect(busy, "must say the check did not happen").toMatch(CLAIMS_FAILURE);
    // The load-bearing one. A teacher told her school is absent types free text
    // and the URN is lost — the exact outcome school-identity.md is built to
    // prevent, reached through a sentence rather than through a bug.
    expect(
      busy,
      "busy must never claim the school is not in the register — StoryJar did not manage to look",
    ).not.toMatch(CLAIMS_ABSENCE);
  });

  test("both leave the teacher able to finish", () => {
    // The module's own header says every state "has to end somewhere a teacher
    // can still finish signing up". These are the two that could strand her.
    expect(noResults, "no-results must carry the way out with it").toMatch(OFFERS_FREE_TEXT);
    expect(busy, "busy must carry the way out too").toMatch(OFFERS_FREE_TEXT);
  });

  test("no-results names what was searched for", () => {
    // Without the query, a teacher who mistyped cannot tell a typo from a school
    // that is genuinely absent — and the second sends her to free text.
    expect(noResults).toContain("Bramblewick");
  });

  test("every state has a sentence, and only an untouched field is silent", () => {
    // Catches a fifth state added without copy: it would announce nothing, and a
    // screen reader user would meet silence where the sighted user meets a list.
    const states: PickerState[] = [
      { kind: "idle" },
      { kind: "too-short" },
      { kind: "results", items: [], truncated: false },
      { kind: "no-results", query: "x" },
      { kind: "busy" },
    ];
    for (const state of states) {
      const said = pickerAnnouncement(state);
      if (state.kind === "idle") {
        expect(said, "an untouched field announces nothing").toBe("");
      } else {
        expect(said.trim(), `state "${state.kind}" announces nothing`).not.toBe("");
      }
    }
  });
});
