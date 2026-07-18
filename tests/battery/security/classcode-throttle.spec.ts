import { test, expect } from "@playwright/test";
import { SCHOOL_A } from "../helpers";

// ===========================================================================
// F16 (FIXED) — the class-code lookup is throttled WITHOUT locking classrooms
// out.
//
// The class-code login is a plain GET (/login/student?code=…) and a hit
// discloses the class name plus every pupil's first name, so it is now rate
// limited (src/lib/classCodeLookup.ts → src/lib/rateLimit.ts) to stop a grind.
//
// The trap this test guards is the one that matters MORE than the throttle
// itself: **a school is one NAT IP.** Thirty children mistyping the code twice
// each is 60 failed lookups from a single IP. A naive per-IP limiter would lock
// the whole class out of the front door on a busy morning. The throttle is
// miss-only and clears on every success, so an honest classroom — a stream of
// mostly-correct entries — never accumulates toward the ceiling.
//
// This lives in the BLOCKING gate: a regression that locks classrooms out is a
// safeguarding failure (a child cannot reach their own jar), not a nice-to-have.
// The grind-actually-throttles direction is proven report-only in
// findings/classcode-throttle-grind.spec.ts (it trips the real in-process
// limiter, which would contaminate sibling logins in the gating run).
// ===========================================================================

const RIGHT = `/login/student?code=${SCHOOL_A.classCode}`; // SUN123 → shows "Amara"
const WRONG = "/login/student?code=ZZZZZZ"; // well-formed but not a real code
const ROSTER_NAME = SCHOOL_A.student; // "Amara" — only rendered on a real hit

test("thirty children mistyping the code are never locked out [F16]", async ({ request }) => {
  // Start from a known-clean key. A successful lookup clears the throttle for
  // this IP, so this both proves the baseline (a real code shows the roster)
  // and wipes any misses left by an earlier spec on the shared dev server. The
  // poll rides out the ≤5s trickle window in the unlikely event we inherit a
  // key that is already over budget.
  await expect(async () => {
    const res = await request.get(RIGHT);
    expect(await res.text()).toContain(ROSTER_NAME);
  }).toPass({ timeout: 15_000 });

  // A morning register: 30 children in one room, on one NAT IP. Each fumbles
  // the code twice, then gets it right. That is 60 misses interleaved with 30
  // successes — exactly the pattern a per-IP hard limiter would punish.
  for (let child = 1; child <= 30; child++) {
    const firstTypo = await request.get(WRONG);
    expect(await firstTypo.text(), `child ${child}, typo 1 leaked a roster`).not.toContain(ROSTER_NAME);
    const secondTypo = await request.get(WRONG);
    expect(await secondTypo.text(), `child ${child}, typo 2 leaked a roster`).not.toContain(ROSTER_NAME);

    // Their real code MUST still reach the name wall — this is the assertion
    // that fails if the throttle ever locks a classroom out.
    const success = await request.get(RIGHT);
    expect(await success.text(), `child ${child} was locked out of their own class`).toContain(ROSTER_NAME);
  }
});
