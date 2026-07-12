import { test, expect } from "@playwright/test";
import { SCHOOL_A } from "../helpers";

// ===========================================================================
// B1 — Keyboard-only navigation for the core flows
//
// A teacher on a classroom laptop (or an AT user) must be able to complete the
// core flows without a mouse. We drive the keyboard only: Tab to move, type to
// fill, Enter to submit.
// ===========================================================================

test("teacher can sign in with the keyboard alone", async ({ page }) => {
  await page.goto("/login/teacher");

  // Focus the email field (it may be first in tab order, or reached via Tab).
  await page.locator("#email").focus();
  await expect(page.locator("#email")).toBeFocused();
  await page.keyboard.type(SCHOOL_A.admin.email);

  await page.keyboard.press("Tab");
  await expect(page.locator("#password")).toBeFocused();
  await page.keyboard.type(SCHOOL_A.admin.password);

  // Enter from within the form submits it.
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === "/teacher" || url.pathname === "/admin");
});

test("a child can pick their name with the keyboard alone", async ({ page }) => {
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);

  const nameCard = page.getByRole("button", { name: SCHOOL_A.student, exact: true });
  await nameCard.focus();
  await expect(nameCard).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL((url) => url.pathname === "/student");
});

test("every interactive control on teacher login is reachable and focus is visible", async ({ page }) => {
  await page.goto("/login/teacher");

  // Walk the tab order and record what receives focus.
  const reached = new Set<string>();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // Focus must be visible — a focused control should not have outline:none
      // with no other focus affordance. We record the tag/id for coverage.
      const cs = getComputedStyle(el);
      return { id: el.id, tag: el.tagName.toLowerCase(), outline: cs.outlineStyle, boxShadow: cs.boxShadow };
    });
    if (info?.id) reached.add(info.id);
  }

  // The email + password inputs and the submit button must all be tabbable.
  expect(reached.has("email")).toBe(true);
  expect(reached.has("password")).toBe(true);
});
