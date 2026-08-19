import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";
import { signInChild } from "./actions";

// ===========================================================================
// The Wriggler: a bot in a real child's session.
//
// Not a persona with a job — a child-shaped fuzzer. It taps whatever is in
// front of it, twice, quickly, in an order nobody designed for, with a reload
// in the middle. Its purpose is the states a scripted journey never reaches:
// the double-submit, the half-open panel, the button pressed while the page is
// still thinking.
//
// It asserts almost nothing. The harness is what is watching: an unhandled
// error, a 5xx or a browser dialog anywhere in here is a blocker, and the
// Wriggler's whole job is to provoke one. Everything it can reach, a four-year-
// old with a sticky tablet can reach too.
//
// The tap order is derived from the run's own seed so a failure can be
// reproduced (printed at the start of the run) rather than being a story about
// something that happened once.
// ===========================================================================

test.use({ persona: TEAM.wriggler });

// A tiny deterministic generator — no Math.random, so a red run is repeatable.
function sequence(seed: number, length: number, ceiling: number): number[] {
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out.push(Math.floor((x / 2147483648) * ceiling));
  }
  return out;
}

const SEED = 20260818; // change to explore a different order; a failure names it

test("tap everything, twice, in the wrong order", async ({ page, tester: t }) => {
  t.say("polish", "fragile", `The Wriggler ran with seed ${SEED}. Re-run with the same seed to reproduce anything below.`);

  await signInChild(t, page, ACADEMY.classes.ks1.code, "Vik");

  const screens = ["/student", "/student/activities", "/student/new/photo", "/student/new/words", "/student"];

  for (const [i, url] of screens.entries()) {
    await carryOn(async () => {
      await t.open(url, `wherever this is (${url})`);

      const targets = page.locator('button:visible, a[href]:visible, [role="button"]:visible');
      const count = Math.min(await targets.count(), 20);
      if (count === 0) return;

      // Three taps per screen, chosen from this run's sequence, each one done
      // twice in quick succession — the child behaviour that finds the
      // double-submit.
      for (const pick of sequence(SEED + i, 3, count)) {
        const target = targets.nth(pick);
        const label = ((await target.innerText().catch(() => "")) || "(no words)").replace(/\s+/g, " ").slice(0, 40);

        // Never sign out mid-run — that ends the session and the rest of the
        // journey tests the login page instead of the product.
        if (/sign out|bye bye|log ?out/i.test(label)) continue;

        await target.click({ timeout: 4000, force: true }).catch(() => {});
        await target.click({ timeout: 2000, force: true }).catch(() => {});
        await page.waitForTimeout(250);

        // Did a double-tap put two of the same thing in?
        if (/hand it in|done|add|save|finish/i.test(label)) {
          t.say(
            "polish",
            "fragile",
            `Double-tapped “${label}” to see whether it submits twice — check the child's journal for a duplicate.`,
          );
        }
      }

      // A reload in the middle of whatever state that left.
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await t.sweep(`after a reload (${url})`);

      // Wherever the taps have landed us, a child must be able to get home.
      const home = page.getByRole("link", { name: /jar|journal|home|back/i }).first();
      const button = page.getByRole("button", { name: /jar|journal|home|back/i }).first();
      const canEscape = (await home.count()) > 0 || (await button.count()) > 0;
      t.expects(
        canEscape,
        "major",
        "stuck",
        "After tapping around I have ended up somewhere with no way back to my jar.",
        `after ${url}`,
      );
    });
  }

  // Finally: the addresses a child reaches by mistyping, sharing a link, or
  // keeping an old bookmark. None of them may be a wall.
  for (const url of ["/student/new/nonsense", "/student/activities/not-a-real-id", "/teacher", "/admin", "/ops"]) {
    await carryOn(async () => {
      t.tolerate(new RegExp(url.replace(/[/-]/g, "\\$&")));
      await t.open(url, `an address I should not be at (${url})`);
      const stranded =
        (await t.seesText(/404|not found|unhandled|error/i, 1200)) &&
        !(await t.seesText(/jar|journal|home|back|sign in/i, 800));
      t.expects(
        !stranded,
        "major",
        "stuck",
        `Landing on ${url} leaves me on a page with an error and nothing to tap. A child who mistypes or follows an old link is stuck there.`,
      );
    });
  }
});
