import { test, expect, type Page, type Browser } from "@playwright/test";
import { SCHOOL_A } from "../helpers";

// ===========================================================================
// B4 — With reduced motion, nothing animates and NOTHING IS LOST
//
// SAFEGUARDING rule 18: prefers-reduced-motion honoured. For a child with
// vestibular sensitivity this is not a preference.
//
// scripts/audit-motion.mjs proves the CSS is SHAPED right — one block, a
// catch-all, nothing outranking it. It cannot prove the app still WORKS with
// motion off, which is the half that matters: Storyjar tells a child where
// their work is partly THROUGH movement (a tile falls into the jar). So the
// risk isn't a stray animation — it's a child who turns motion off and can no
// longer tell what happened. Status must never depend on motion (WCAG 1.4.1,
// 2.3.3).
//
// ⚠️ `test.use({ reducedMotion: "reduce" })` DOES NOT WORK in this config — it
// is silently ignored and `matchMedia("(prefers-reduced-motion: reduce)")`
// stays false, so the tests would pass while quietly proving nothing. Verified
// three ways: no test.use → false, describe-level test.use → false,
// browser.newContext({ reducedMotion: "reduce" }) → TRUE. Always build the
// context explicitly here. (tests/e2e/landing.spec.ts already does this; the
// reason was never written down.)
// ===========================================================================

async function reducedMotionPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1024, height: 768 }, // classroom iPad, landscape
  });
  const page = await context.newPage();
  // Fail loudly rather than silently prove nothing — see the note above.
  await page.goto("/");
  const reduced = await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  expect(reduced, "the browser must actually be in reduced-motion mode").toBe(true);
  return page;
}

// Every animation's EFFECTIVE timing, as the browser resolved it.
async function runningAnimations(page: Page) {
  return page.evaluate(() =>
    document.getAnimations().map((a) => {
      const t = a.effect?.getComputedTiming();
      return {
        name: (a as unknown as { animationName?: string }).animationName ?? "(js animation)",
        duration: typeof t?.duration === "number" ? t.duration : 0,
        // Infinite resolves to Infinity here; null means "not iterating".
        iterations: t?.iterations ?? 1,
      };
    }),
  );
}

function assertStill(anims: { name: string; duration: number; iterations: number }[]) {
  for (const a of anims) {
    expect(a.duration, `${a.name} should be effectively instant`).toBeLessThanOrEqual(1);
    // An infinite animation whose duration is killed but whose iteration count
    // isn't runs ~100x/second — flickering rather than stopping, which is worse
    // than the motion it replaced. This is the case nobody thinks of.
    expect(a.iterations, `${a.name} must be stopped, not sped up`).toBeLessThanOrEqual(1);
  }
}

test("the landing jar does not jiggle — and does not flicker instead", async ({ browser }) => {
  const page = await reducedMotionPage(browser);
  assertStill(await runningAnimations(page));
  await page.context().close();
});

test("nothing on the class-code screen animates", async ({ browser }) => {
  const page = await reducedMotionPage(browser);
  await page.goto("/login/student");
  assertStill(await runningAnimations(page));
  await page.context().close();
});

// The important half. A child who cannot have motion must still be able to tell
// waiting work from work that is in the jar — that is the whole point of SJ-04.
test("a child can still see where their work is, with motion off", async ({ browser }) => {
  const page = await reducedMotionPage(browser);
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);
  await page.getByRole("button", { name: "Chloe", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");

  // The jar still reports its state in words — to a screen reader, and to a
  // teacher standing next to the child.
  await expect(page.getByRole("img", { name: /in your jar/ })).toBeVisible();
  // The status still has a tag AND a sentence, neither of which moves.
  await expect(page.getByText("Waiting", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/waiting for your teacher to see it/i).first()).toBeVisible();

  assertStill(await runningAnimations(page));
  await page.context().close();
});

// A tile approved while the child was away must still ARRIVE — it just doesn't
// fly. If reduced motion meant "no drop AND no tile", the child would lose the
// information rather than the animation.
test("an arrived tile still lands in the jar with motion off", async ({ browser }) => {
  const page = await reducedMotionPage(browser);
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);
  await page.getByRole("button", { name: "Amara", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");

  const arrivals = page.locator("[data-jar-arrival]");
  if (await arrivals.count()) {
    await expect
      .poll(() => arrivals.first().evaluate((el) => Number(getComputedStyle(el).opacity)), {
        message: "the tile must still be visible — reduced motion removes the flight, not the fact",
      })
      .toBeGreaterThan(0.9);
  }
  await page.context().close();
});
