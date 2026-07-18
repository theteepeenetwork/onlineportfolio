import { test, expect } from "@playwright/test";
import { SCHOOL_A } from "../helpers";

// ===========================================================================
// F16 (FIXED — mechanism proof) — a pure-miss grind on the class-code lookup
// gets throttled.
//
// The blocking half of F16 (security/classcode-throttle.spec.ts) proves the
// property that matters most: an honest classroom is never locked out. This is
// the other half — proof that the throttle actually bites a grinder.
//
// It drives the key well past its miss budget with wrong codes ONLY (no
// success to clear it), then shows that a valid code is briefly refused —
// returning the same not-found screen a wrong code does, so the grinder can't
// even tell throttling from a miss — until the trickle window lets one through
// and disclosure resumes.
//
// REPORT-ONLY, for the F2 reason: it trips the real in-process limiter, whose
// over-budget state would contaminate sibling logins in a gating run. It ends
// with a successful lookup, which clears the key again.
// ===========================================================================

const RIGHT = `/login/student?code=${SCHOOL_A.classCode}`;
const WRONG = "/login/student?code=QQQQQQ";
const ROSTER_NAME = SCHOOL_A.student; // "Amara"

test("a pure-miss grind is throttled, then recovers [F16]", async ({ request }) => {
  // Clear the key, then bury it in misses with no success to reset it. 60 > the
  // 50-miss budget, so the key ends over budget and inside the trickle window.
  await request.get(RIGHT);
  for (let i = 0; i < 60; i++) await request.get(WRONG);

  // A valid code is now refused: over budget, inside the 5s trickle cooldown,
  // the lookup never runs and the roster is withheld — indistinguishable from a
  // wrong code. (Timing-based; report-only, so a slow box can't block a merge.)
  const gated = await request.get(RIGHT);
  expect(await gated.text()).not.toContain(ROSTER_NAME);

  // After the trickle window, the same valid code discloses again — and that
  // success clears the key, leaving the shared server clean for later specs.
  await new Promise((r) => setTimeout(r, 5_200));
  await expect(async () => {
    const res = await request.get(RIGHT);
    expect(await res.text()).toContain(ROSTER_NAME);
  }).toPass({ timeout: 15_000 });
});
