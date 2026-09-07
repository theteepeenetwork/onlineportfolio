import { test, expect } from "@playwright/test";
import { summariseMailHealth } from "@/lib/schoolMailHealth";

// ===========================================================================
// The school-admin email health badge: what it is allowed to say.
//
// This is the data behind the Admin > Billing badge a school business manager
// reads when a parent rings to say a sign-in link never arrived. It is in the
// SECURITY suite rather than a UX one because both things it can get wrong are
// claims rather than layout: telling her that email is fine when nothing was
// tried (F30), and letting her believe the figures are about her school when
// they are about every school together.
//
// No database and no browser. `summariseMailHealth` is split out of
// `readSchoolMailHealth` precisely so the half carrying the judgement can be
// asserted directly. The other half is a windowed `findMany` over MailCounter,
// which fails visibly; this half is where a wrong answer would be quiet.
//
// A note on what is NOT here. There is no cross-tenant isolation test, and the
// convention in AGENTS.md asks for one on anything taking an id. This takes no
// id. It cannot be scoped to a school at all, because MailCounter holds no
// school, no recipient and no domain (FINDINGS F6: a per-send record would
// rebuild inside the product the enumeration signal the public family form
// refuses to give). So the isolation property here is the stronger one — there
// is nothing to isolate — and what needs guarding instead is that the screen
// SAYS so, which is the last test in this file.
// ===========================================================================

test.describe("the school email health badge", () => {
  test("nothing attempted does not read as everything being fine", () => {
    const health = summariseMailHealth({ accepted: 0, failedOutright: 0, unconfigured: 0 });

    expect(health.state).toBe("NO_DATA");
    // The F30 shape: silence rendering as health. The badge must not claim
    // anything is working, because nothing was tried and nothing is known.
    expect(health.state).not.toBe("ALL_ACCEPTED");
    expect(health.headline).not.toMatch(/working|fine|healthy|all good/i);
    expect(health.attempted).toBe(0);
    // And it must not carry the success small print, which would be claiming a
    // provider accepted messages that were never sent.
    expect(health.acceptedNote).toBeNull();
  });

  test("a clean week says so, and says what accepted does not mean", () => {
    const health = summariseMailHealth({ accepted: 20, failedOutright: 0, unconfigured: 0 });

    expect(health.state).toBe("ALL_ACCEPTED");
    expect(health.attempted).toBe(20);
    expect(health.failed).toBe(0);
    // "Accepted" is not "delivered". A manager reading a green badge with a
    // parent on the phone insisting nothing arrived needs both facts at once,
    // so the caveat travels with the good news rather than living on a
    // different screen.
    expect(health.acceptedNote).not.toBeNull();
    expect(health.acceptedNote).toMatch(/not a delivery receipt/i);
  });

  test("a few failures are reported without being an alarm", () => {
    // 2 of 20 is 10 per cent: under the ratio, so it is a fact rather than a
    // call to action. A badge that shouts at every single failure gets muted,
    // and then it is not there for the week that matters.
    const health = summariseMailHealth({ accepted: 18, failedOutright: 2, unconfigured: 0 });

    expect(health.state).toBe("SOME_FAILED");
    expect(health.attempted).toBe(20);
    expect(health.failed).toBe(2);
  });

  test("more than one in five failing is an alarm", () => {
    const health = summariseMailHealth({ accepted: 16, failedOutright: 14, unconfigured: 0 });

    expect(health.state).toBe("NEEDS_ATTENTION");
    expect(health.failed).toBe(14);
    // She is the person parents ring. The detail has to tell her that this is
    // the reason, rather than leaving her to connect two facts on two days.
    expect(health.detail).toMatch(/never arrived/i);
  });

  test("attempts that never reached the provider count against the verdict", () => {
    // UNCONFIGURED means the API key was missing or revoked, so no attempt
    // reached the provider at all: no bounce, no provider-side error, and this
    // counter is the only place it is visible. Counting it as anything other
    // than a failure would render a completely dead mail path as a clean week.
    const health = summariseMailHealth({ accepted: 0, failedOutright: 0, unconfigured: 12 });

    expect(health.state).toBe("NEEDS_ATTENTION");
    expect(health.attempted).toBe(12);
    expect(health.failed).toBe(12);
    expect(health.acceptedNote).toBeNull();
    // And it must be named as ours to fix. A business manager cannot do
    // anything about StoryJar's own credentials, and sending her to chase
    // parents' addresses would waste her morning.
    expect(health.detail).toMatch(/not the parent's|please tell us|tell StoryJar/i);
  });

  test("every state carries the sentence that stops it overclaiming", () => {
    const cases = [
      { accepted: 0, failedOutright: 0, unconfigured: 0 },
      { accepted: 20, failedOutright: 0, unconfigured: 0 },
      { accepted: 18, failedOutright: 2, unconfigured: 0 },
      { accepted: 16, failedOutright: 14, unconfigured: 0 },
    ];

    for (const totals of cases) {
      const health = summariseMailHealth(totals);
      // Not "should ideally mention": the scope note is the only thing standing
      // between this badge and a school believing StoryJar can see its own
      // school's mail. It is a field rather than a comment so it cannot be
      // dropped by whoever builds the next version of the badge.
      expect(health.scopeNote).toMatch(/every school together/i);
      expect(health.scopeNote).toMatch(/not whether it is working for your school/i);
      expect(health.windowLabel).toBe("the last 7 days");
    }
  });

  test("every sentence the badge renders survives, in every state", () => {
    // Requested by teacher-lead, who built the card. `MailHealthCard` in
    // src/app/admin/BillingPane.tsx renders exactly five fields and writes no
    // copy of its own, deliberately, so that the words and the rule that
    // produced them stay in one file. The failure that buys: drop or rename one
    // of the five here and the badge loses a sentence SILENTLY — a caveat
    // vanishing from a screen with nothing going red. `scopeNote` and
    // `acceptedNote` are the two it would hurt most to lose, because both exist
    // to stop the badge overclaiming.
    const cases: Array<[string, Parameters<typeof summariseMailHealth>[0]]> = [
      ["NO_DATA", { accepted: 0, failedOutright: 0, unconfigured: 0 }],
      ["ALL_ACCEPTED", { accepted: 20, failedOutright: 0, unconfigured: 0 }],
      ["SOME_FAILED", { accepted: 18, failedOutright: 2, unconfigured: 0 }],
      ["NEEDS_ATTENTION", { accepted: 16, failedOutright: 14, unconfigured: 0 }],
    ];

    for (const [expectedState, totals] of cases) {
      const health = summariseMailHealth(totals);
      expect(health.state).toBe(expectedState);

      // Present and saying something, not merely defined. An empty string is a
      // dropped sentence that happens to typecheck.
      for (const field of ["headline", "detail", "scopeNote"] as const) {
        expect(health[field], `${expectedState}.${field}`).toBeTruthy();
        expect(health[field].trim().length, `${expectedState}.${field}`).toBeGreaterThan(0);
      }

      // acceptedNote is the one that is deliberately absent most of the time,
      // so it gets the rule rather than the blanket check: the caveat must be
      // there whenever the badge is claiming success, and must NOT be there
      // when it is not, because a delivery caveat under "Email needs attention"
      // is noise attached to the wrong sentence.
      if (expectedState === "ALL_ACCEPTED") {
        expect(health.acceptedNote?.trim()).toBeTruthy();
      } else {
        expect(health.acceptedNote).toBeNull();
      }
    }
  });

  test("no field can carry an address, a domain or a school", () => {
    // The DTO is sent to a browser as a prop. Nothing in MailCounter could put
    // an identifier in it today, which is the point — this asserts the shape
    // stays that way, so that adding a "recent failures" list later has to come
    // through here first.
    const health = summariseMailHealth({ accepted: 5, failedOutright: 5, unconfigured: 5 });

    const fields = Object.keys(health).sort();
    expect(fields).toEqual(
      [
        "acceptedNote",
        "attempted",
        "detail",
        "failed",
        "headline",
        "scopeNote",
        "state",
        "windowLabel",
      ].sort(),
    );

    const rendered = JSON.stringify(health);
    expect(rendered).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});
