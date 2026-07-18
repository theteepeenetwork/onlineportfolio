import { test, expect } from "@playwright/test";
import { AVATAR_PALETTE, avatarInk, contrastRatio } from "../../../src/lib/avatar";
import { SCHOOL_A } from "../helpers";

// ===========================================================================
// B5 — Every child can read their own initial
//
// A child's name card is how they sign in: they are asked to find themselves by
// it. SAFEGUARDING rule 18 puts WCAG 2.2 AA under "Access for every child", and
// AA means 4.5:1.
//
// Cream-on-everything left SIX of the eight palette colours at 1.8–2.5:1 — so
// six children in eight were asked to identify themselves by an initial they
// could barely see. The ink now adapts to the disc (src/lib/avatar.ts).
//
// WHY NOTHING CAUGHT IT: tests/battery/a11y/axe.spec.ts baselines
// `color-contrast` away while the F11 debt is open, so the name-picker scan
// passed the whole time. That is what a baselined rule costs — this file is a
// direct, un-baselined check of the one thing the baseline was hiding.
// ===========================================================================

const AA = 4.5;

// The palette is data, so this needs no browser: it is arithmetic on constants,
// and it fails the build the moment someone adds a pretty colour that a child
// cannot read on. `avatarInk` picks the BETTER of two inks, which is not the
// same as promising a readable one — this is what makes it a promise.
test("every colour in the palette gives a readable initial", () => {
  const failures = AVATAR_PALETTE.map((bg) => ({ bg, ink: avatarInk(bg), ratio: contrastRatio(avatarInk(bg), bg) }))
    .filter((r) => r.ratio < AA)
    .map((r) => `${r.bg} with ${r.ink} = ${r.ratio.toFixed(2)}:1`);

  expect(failures, `avatar colours below ${AA}:1 — a child cannot read their own initial`).toEqual([]);
});

// The prisma schema's default (#4f46e5) is NOT in the palette — it only applies
// to a pupil created outside the signup path. It still has to be readable.
test("the schema's fallback avatar colour is readable too", () => {
  const fallback = "#4f46e5";
  expect(contrastRatio(avatarInk(fallback), fallback)).toBeGreaterThanOrEqual(AA);
});

// And the same thing as a child actually meets it — the palette being sound on
// paper doesn't prove the page uses it.
test("every initial on a real name wall clears AA", async ({ page }) => {
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);

  const cards = await page.evaluate(() => {
    const lum = (c: string) => {
      const [r, g, b] = c.match(/\d+/g)!.map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    return [...document.querySelectorAll(".sj-namecard")].map((card) => {
      const disc = card.querySelector("span[aria-hidden]") as HTMLElement;
      const cs = getComputedStyle(disc);
      return { initial: disc.textContent, ratio: ratio(cs.color, cs.backgroundColor) };
    });
  });

  expect(cards.length, "the name wall should have children on it").toBeGreaterThan(0);
  for (const c of cards) {
    expect(c.ratio, `"${c.initial}" on its disc`).toBeGreaterThanOrEqual(AA);
  }
});
