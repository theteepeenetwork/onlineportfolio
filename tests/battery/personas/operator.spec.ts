import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";
import { signInOperator } from "./actions";

// ===========================================================================
// Ravi is the whole of Storyjar's staff.
//
// He opens the console between other jobs to answer three questions: is
// anything on fire, is anybody's email broken, and can I do the thing a school
// has just rung me about. The console is deliberately blind to children's work
// (SAFEGUARDING rules 4, 5 and 11) — so the test is not "can he see everything"
// but "can he answer an operational question without seeing a child".
//
// He also has the only account that can lock itself out, so the door is part of
// the journey rather than a preamble.
// ===========================================================================

test.use({ persona: TEAM.operator });

const CONSOLE_SCREENS: [string, string][] = [
  ["/ops", "the operations home"],
  ["/ops/schools", "the schools list"],
  ["/ops/billing", "billing"],
  ["/ops/mail", "email delivery"],
  ["/ops/lookup", "find an adult"],
  ["/ops/health", "service health"],
  ["/ops/handbook", "the handbook"],
];

test("the nightly check: is anything on fire?", async ({ page, tester: t }) => {
  await signInOperator(t, page);

  await carryOn(async () => {
    // The console must answer the question it exists for, in words, without
    // being read like a manual.
    const answered = await t.seesText(/nothing needs you|no alerts|all (well|good)|needs attention/i, 3000);
    t.expects(
      answered,
      "major",
      "confusing",
      "The console does not answer “is anything wrong?” on the screen I land on. I have to open each area and form my own opinion.",
    );

    for (const [url, label] of CONSOLE_SCREENS.slice(1)) {
      await t.open(url, label);
      t.expects(
        !(await t.seesText(/not found|404/i, 800)),
        "blocker",
        "broke",
        `${label} is not reachable from a signed-in operator session.`,
        url,
      );
    }
    t.budget(12, "The nightly check across the whole console");
  });

  // Health: the screen that decides whether he goes to bed.
  await carryOn(async () => {
    t.newJob();
    await t.open("/ops/health", "service health");
    const inWords = await t.seesText(/not monitored|healthy|ok|watching|no signal/i, 3000);
    t.expects(
      inWords,
      "major",
      "confusing",
      "Health is not stated in words. A green dot tells a colour-blind operator nothing, and tells nobody what it is green ABOUT.",
    );
    t.expects(
      await t.seesText(/backup/i, 2000),
      "major",
      "confusing",
      "Nothing on the health screen mentions backups of the children's photographs, drawings and voice notes — the one thing whose absence would end the company.",
    );
  });
});

test("a school rings up: a family code has gone to the wrong house", async ({ page, tester: t }) => {
  // The commonest real support call, and the one operator action that touches a
  // family. Every step of it must be possible without seeing a child.
  await signInOperator(t, page);
  await t.open("/ops/lookup", "find an adult");

  await carryOn(async () => {
    const search = page.locator('input[type="email"], input[type="search"], input[type="text"]').first();
    if (!(await t.sees(search, 3000))) {
      t.say("blocker", "stuck", "There is no way to look up the adult a school is ringing me about.");
      return;
    }

    // Before it will search at all, the screen asks WHY, in at least twelve
    // characters, and says so on the page. That is the design (it is recorded
    // word for word against the address), and a tester who skips it gets an
    // empty screen and reports a broken search — which is what happened the
    // first time this journey ran.
    const reason = page.locator('input[name*="reason" i], textarea[name*="reason" i]').first();
    const asksWhy = await t.sees(reason, 1500);
    t.expects(
      asksWhy,
      "minor",
      "fragile",
      "I can look up a real adult's record without saying why. Every one of these has to be defensible months later.",
    );

    // Try it the lazy way first: a reason too short to mean anything. Being
    // refused here is the screen working, and what matters is whether the
    // refusal tells me what would do.
    if (asksWhy) {
      await t.act("try a one-word reason", async () => {
        await reason.fill("asked");
        await search.fill(ACADEMY.parents.removable.email);
        await page.getByRole("button", { name: /search|find|look/i }).first().click();
      });
      const explained = await t.seesText(/12 characters|at least|longer|more detail|why/i, 3000);
      t.expects(
        explained,
        "minor",
        "confusing",
        "My reason was refused and nothing told me what would be accepted, so I am guessing at the length.",
      );
      await t.act("write a proper reason", async () => {
        await reason.fill("Parent rang the school office: their letter went to the old address.");
      });
    }

    await t.act("look the parent up by their address", async () => {
      await search.fill(ACADEMY.parents.removable.email);
      await page.getByRole("button", { name: /search|find|look/i }).first().click();
    });
    await page.waitForTimeout(1200);
    await t.sweep("the adult's record");

    const found = await t.seesText(/bramblewood|family|code|parent|no match|not found|nothing/i, 4000);
    t.expects(found, "major", "confusing", "I searched for an address and the screen said nothing at all — I cannot tell whether it found them.");

    // A child must not be reachable from here. This is the guarantee sold to the
    // school's data protection lead, so a tester checks it as a user, not only
    // as a static gate.
    //
    // WORD BOUNDARIES, and they are not pedantry: the first version of this
    // check searched for the child's name as a substring, and "Bo" matched the
    // "bo" in "about" in the screen's own explanatory copy. It reported a
    // safeguarding breach that did not exist. A tester who cries wolf about the
    // one promise the whole product rests on is worse than no tester.
    const childNames = new RegExp(`\\b(${ACADEMY.parents.removable.children.join("|")})\\b`);
    const leaked = await t.seesText(childNames, 1500);
    t.expects(
      !leaked,
      "blocker",
      "broke",
      "A child's name is on the operator's screen. Storyjar's promise to schools is that its staff cannot see children through the product.",
      `matched ${childNames}`,
    );

    // Can he actually fix it — with a reason recorded?
    const rotate = page.getByRole("button", { name: /rotate|new code|change the code/i }).first();
    const canFix = await t.sees(rotate, 2000);
    t.expects(
      canFix,
      "major",
      "stuck",
      "I can find the family but I cannot issue them a new code, so the answer to the school is “I will get back to you”.",
    );
    if (!canFix) return;

    await t.act("start issuing a new code", async () => rotate.click());
    await t.sweep("the confirm step");

    t.expects(
      await t.seesText(/reason/i, 2000),
      "major",
      "fragile",
      "I can change a family's access without stating why. Every one of these has to be defensible months later.",
    );
    t.expects(
      await t.seesText(/you will not see the new code|not be told|school is not told/i, 2000),
      "minor",
      "confusing",
      "Nothing tells me what this does NOT do — whether I will see the new code, and whether the school is told. I have a parent on the phone and I need to know what to promise.",
    );

    t.budget(10, "Answering a support call about a family code");
  });
});

test("is anybody's email broken?", async ({ page, tester: t }) => {
  await signInOperator(t, page);
  await t.open("/ops/mail", "email delivery");

  await carryOn(async () => {
    const verdict = await t.seesText(/accepted|needs attention|failed|attempted/i, 3000);
    t.expects(
      verdict,
      "major",
      "confusing",
      "The email screen does not say whether email is working. That is the only question it exists to answer.",
    );

    // The operational gap that matters more than the screen: does anything tell
    // him, or does he have to remember to look?
    t.expects(
      await t.seesText(/alert|notify|told|emailed you|warn/i, 2000),
      "major",
      "fragile",
      "Nothing here announces a problem. Mail can be failing for a day and the only way I find out is by choosing to look at this page.",
    );

    // No address may appear here, and a tester should check it by looking.
    const address = await t.seesText(/@[a-z0-9.-]+\.[a-z]{2,}/i, 1200);
    t.expects(
      !address,
      "blocker",
      "broke",
      "An email address is visible on the mail screen. Addresses belong to real adults and this screen is meant to hold none.",
    );
  });
});
