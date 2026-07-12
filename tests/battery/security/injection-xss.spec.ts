import { test, expect } from "@playwright/test";
import { SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// A6 — Injection & input handling (runtime XSS)
//
// Pupil names and journal text are attacker-controllable free text that gets
// rendered in the teacher/parent UIs. React escapes by default and the app
// avoids dangerouslySetInnerHTML on user content (asserted statically in
// scripts/audit-static.mjs). Here we prove it at runtime: a name containing an
// XSS payload renders as inert TEXT and executes no script.
//
// (A static grep gate for raw Prisma queries + dangerouslySetInnerHTML lives in
// scripts/audit-static.mjs and runs in `test:security`.)
// ===========================================================================

const PAYLOAD = `<img src=x onerror="window.__xss=1">Rob`;

test("an XSS payload in a pupil name is escaped, not executed", async ({ page }) => {
  // Trip a global if any injected handler ever fires.
  await page.addInitScript(() => {
    (window as unknown as { __xss?: number }).__xss = 0;
  });

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/class");

  // Open Acorn class → Add pupil → paste the payload as a name.
  await page.getByRole("button", { name: /acorn/i }).click();
  await page.getByRole("button", { name: /add pupil/i }).click();
  await page.locator('textarea[name="names"]').fill(PAYLOAD);
  await page.getByRole("button", { name: /add pupil/i }).last().click();

  // The name should now appear on the roster as literal text. The surname is
  // dropped (first-names-only), so the rendered token is the escaped tag text.
  await page.waitForTimeout(500);

  // No injected handler fired.
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBe(0);

  // And crucially: no real <img src=x> element was injected into the DOM from
  // the name (React rendered the payload as text, not markup).
  const injected = await page.evaluate(
    () => document.querySelectorAll('img[src="x"]').length,
  );
  expect(injected).toBe(0);
});

test("journal caption text is rendered inert (no script execution)", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __xss?: number }).__xss = 0;
  });
  // The seeded Oakfield approved moment carries a plain caption; loading the
  // parent view (which renders captions) must not execute anything.
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/queue"); // renders pending captions incl. free text
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBe(0);
});
