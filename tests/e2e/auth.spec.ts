import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin } from "./helpers";

test.describe("Sign in", () => {
  test("teacher signs in and sees their dashboard", async ({ page }) => {
    await teacherLogin(page);
    await expect(page.getByRole("heading", { name: /Hello,/ })).toBeVisible();
    await expect(page.getByText("Sunflower Class")).toBeVisible();
  });

  test("teacher is rejected with a wrong password", async ({ page }) => {
    await page.goto("/login/teacher");
    await page.fill("#email", "teacher@school.uk");
    await page.fill("#password", "wrong");
    await page.click('button[type="submit"]');
    await expect(page.getByText(/don't match/)).toBeVisible();
  });

  test("student signs in with the class code and their name", async ({ page }) => {
    await studentLogin(page, "Amara");
    await expect(page.getByText("Add to my jar")).toBeVisible();
    await expect(page.getByText("Sunflower Class")).toBeVisible();
  });

  // SJ-01: the landing page used to offer "Teacher sign in" and nothing else, so
  // a child on a fresh classroom iPad had no way in without an adult. The pupil
  // door is their only self-serve route — if it ever disappears again, a child
  // is stuck, so guard it here rather than in the report-only UX project.
  test("a child can reach sign-in from the landing page on their own", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "I'm a pupil" }).click();
    await expect(page.getByRole("heading", { name: /what's your class code/i })).toBeVisible();
  });
});

// SJ-02 — the class code is the first thing a child meets and was the hardest
// step in the app: a single text field that raised the iPad keyboard over the
// Next button. These drive the on-screen pad the way a child does, at the
// classroom iPad's real viewport.
test.describe("Class code entry", () => {
  test.use({ viewport: { width: 1024, height: 768 } }); // classroom iPad, landscape

  test("a child taps out a code on the pad and reaches their class", async ({ page }) => {
    await page.goto("/login/student");
    for (const ch of "BTF789") await page.getByRole("button", { name: `Add ${ch}`, exact: true }).click();

    // The pad alone completes the code — no typing, no OS keyboard.
    const next = page.locator('button[type="submit"]');
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByRole("heading", { name: /tap your name/i })).toBeVisible();
  });

  test("Next stays out of reach until the code is complete", async ({ page }) => {
    await page.goto("/login/student");
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    for (const ch of "BTF78") await page.getByRole("button", { name: `Add ${ch}`, exact: true }).click();
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await page.getByRole("button", { name: "Add 9", exact: true }).click();
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });

  // The whole point of the pad: the OS keyboard can never rise over Next,
  // because there's no focused text input to summon it.
  test("no text input, so the iPad keyboard never covers the pad", async ({ page }) => {
    await page.goto("/login/student");
    const visibleTextInputs = await page.locator('input:not([type="hidden"])').count();
    expect(visibleTextInputs, "a focusable text field would raise the OS keyboard").toBe(0);
  });

  // SJ-02's actual complaint was that Next was unreachable. It has to stay on
  // screen without scrolling, at the classroom iPad's real height, or a child
  // simply cannot get in — hence the blocking gate rather than report-only.
  test("Next and every key stay on screen, and meet the 64px child floor", async ({ page }) => {
    await page.goto("/login/student");

    const next = page.locator('button[type="submit"]');
    const nextBox = (await next.boundingBox())!;
    expect(nextBox.height, "Next height").toBeGreaterThanOrEqual(64);
    expect(nextBox.y + nextBox.height, "Next must sit within the viewport, unburied").toBeLessThanOrEqual(768);

    const keys = page.locator("button[data-key]:not([disabled])");
    for (let i = 0; i < (await keys.count()); i++) {
      const box = (await keys.nth(i).boundingBox())!;
      expect(box.height, "key height (SAFEGUARDING rule 18)").toBeGreaterThanOrEqual(64);
    }

    const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight);
    expect(scrolls, "the sign-in screen must not need scrolling on a classroom iPad").toBe(false);
  });

  // Codes never contain I/L/O/0/1 (too easily confused). The keys stay on the
  // pad so the alphabet reads normally to a 5-year-old, but do nothing.
  test("characters that codes never use are shown but inert", async ({ page }) => {
    await page.goto("/login/student");
    for (const ch of ["I", "L", "O", "0", "1"]) {
      await expect(page.locator(`button[data-key="${ch}"]`), `${ch} is offered but disabled`).toBeDisabled();
    }
    await expect(page.locator("button[data-key]")).toHaveCount(36); // whole alphabet + 0-9
  });

  test("a code we can't find is answered kindly, not with a red error", async ({ page }) => {
    await page.goto("/login/student?code=ZZZZZZ");
    await expect(page.getByText(/couldn't find that class code/i)).toBeVisible();
    // Still on the code screen with the pad ready for another go.
    await expect(page.getByRole("button", { name: "Add A", exact: true })).toBeVisible();
  });

  // A child copying "BTF 789" off the board types the space too. The old screen
  // modelled the code WITH a space and then never matched it.
  test("a code typed with a space still finds the class", async ({ page }) => {
    await page.goto("/login/student?code=BTF%20789");
    await expect(page.getByRole("heading", { name: /tap your name/i })).toBeVisible();
  });
});
