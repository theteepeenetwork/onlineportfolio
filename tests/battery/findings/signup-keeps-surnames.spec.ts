import { test, expect } from "@playwright/test";

// ===========================================================================
// F39 — the sign-up wizard stores children's surnames.
//
// SAFEGUARDING rule 2 is a hard limit, not a target: "We store a child's first
// name and their work. No surnames." The product enforces it — in one of the
// two places a class list can be typed.
//
// `addStudents` (the roster's "＋ Add pupil", the paste-a-register path) runs
// every entry through `deriveChildNames`, which drops the surname and adds back
// only the shortest prefix needed to tell two Olivias apart.
//
// `createTeacherAccount` — step 4 of the sign-up wizard, the FIRST class list a
// teacher ever types — stores `raw.trim()`. Whatever they paste is what is
// stored, and a register pasted out of a school MIS has surnames on it.
//
// Those names are then the buttons on `/login/student?code=…`: the screen the
// whole class looks at, on a code that is written on the board.
//
// Found by the user-tester team on 2026-08-18: Ms Blake's first twenty minutes
// (tests/battery/personas/teacher-first-day.spec.ts), pasting her register the
// way it comes out of the office system.
//
// Asserts the INTENDED behaviour, so it FAILS until the two paths agree. When
// they do, move it into `tests/e2e/auth.spec.ts` and delete F39.
// ===========================================================================

test("F39 — a register pasted at sign-up is stored as first names only", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);

  await page.goto("/signup/teacher");
  await page.locator("#su-fullname").fill("Robin Fixture");
  await page.locator("#su-email").fill(`f39.${stamp}@newschool.test`);
  await page.locator("#su-pass").fill("bramble-fox-lantern-9");
  await page.getByRole("button", { name: /^continue$/i }).click();

  await page.locator("#su-school").fill(`F39 Primary ${stamp}`);
  await page.getByRole("button", { name: /^continue$/i }).click();

  await page.locator("#su-class").fill("Kingfishers");
  await page.locator('input[name="su-agemode"]').first().check();
  await page.getByRole("button", { name: /create class/i }).click();

  // A register exactly as it comes out of a school MIS.
  await page.locator("#su-children").fill("Ali Hassan\nBea Turner\nCallum Reid");
  await page.getByRole("button", { name: /add pupils/i }).click();
  await page.waitForURL((url) => !/\/signup\/teacher$/.test(url.pathname), { timeout: 30_000 });

  // The children's own sign-in screen is where those names are shown, so it is
  // where the rule has to hold.
  await page.goto("/teacher/class");
  const code = ((await page.locator('p:has-text("class code") strong').first().innerText()) ?? "").trim();
  expect(code, "the new class has a code").toMatch(/^[A-Z0-9]{4,8}$/);

  await page.context().clearCookies();
  await page.goto(`/login/student?code=${code}`);
  await expect(page.getByRole("button", { name: /Ali/ })).toBeVisible();

  const wall = await page.locator("body").innerText();
  for (const surname of ["Hassan", "Turner", "Reid"]) {
    expect(
      wall,
      `SAFEGUARDING rule 2: a child's surname must never be stored, and never be on the class sign-in screen (found "${surname}")`,
    ).not.toContain(surname);
  }
});
