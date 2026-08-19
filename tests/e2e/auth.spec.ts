import { test, expect } from "@playwright/test";
import { CODE_ALPHABET, CODE_LENGTH } from "@/lib/classCodeChars";
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

// ===========================================================================
// F39 — a class list pasted into the SIGN-UP WIZARD is stored as first names
// only, exactly as the roster's own paste path stores it.
//
// Promoted here from the findings project on 19 August 2026, when it was fixed.
// SAFEGUARDING rule 2 is a hard limit ("we store a child's first name and their
// work; no surnames"), and `Student.name` is the label on the name cards at
// /login/student?code=…, a screen a whole class reads off a code written on the
// board. The wizard used to store `raw.trim()`; a register pasted out of a
// school MIS therefore put "Ali Hassan" in front of the class.
//
// Found by the user-tester team: Ms Blake's first twenty minutes
// (tests/battery/personas/teacher-first-day.spec.ts).
// ===========================================================================
test("a register pasted at sign-up is stored as first names only", async ({ page }) => {
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

  // The teacher is told what will be stored, before they commit to it.
  await expect(page.getByText(/stored as first names only/i)).toBeVisible();

  await page.getByRole("button", { name: /add pupils/i }).click();
  await page.waitForURL((url) => !/\/signup\/teacher$/.test(url.pathname), { timeout: 30_000 });

  await expect(page.getByRole("heading", { name: /class code/i })).toBeVisible();

  // Read the code off the "How your pupils sign in" panel, where it is rendered
  // whole. The big display above it prints one character per element, so body
  // text there is not contiguous and cannot be matched.
  //
  // Matched against the REAL alphabet rather than a guessed shape: codes are six
  // characters from CODE_ALPHABET, which omits 0/O/1/I/L so a five-year-old
  // reading one off the board cannot confuse two glyphs — and may therefore
  // start with a digit. An earlier version of this assumed three leading
  // letters, and went red on a perfectly good code (6W3TSN).
  const codeBox = page.getByText("1 · Type the code").locator("xpath=preceding-sibling::div[1]");
  const code = (await codeBox.innerText()).trim();
  expect(code, "the new class has a code a child could type").toMatch(
    new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`),
  );

  // The children's own sign-in screen is where those names are shown, so it is
  // where the rule has to hold.
  await page.context().clearCookies();
  await page.goto(`/login/student?code=${code}`);
  await expect(page.getByRole("button", { name: /Ali/ })).toBeVisible();

  const wall = await page.locator("body").innerText();
  for (const surname of ["Hassan", "Turner", "Reid"]) {
    expect(wall, `SAFEGUARDING rule 2: no surname may reach the class sign-in screen (found "${surname}")`).not.toContain(surname);
  }
});
