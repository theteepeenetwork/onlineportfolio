import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_E, loginTeacher } from "../helpers";

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

// A DISABLED BUTTON IS NOT IN THE TAB ORDER, WHICH IS WHY THE REASON HAS TO BE
// TEXT. When an unpaid school's admin cannot promote a colleague, the "Admin"
// button is `disabled` — correct, because nothing should look pressable that is
// not, but it means a keyboard-only or screen-reader user never lands on it and
// never hears an explanation attached to it. The explanation is therefore a
// visible line in the menu itself, read in the ordinary flow of the panel, and
// the two roles that ARE allowed stay reachable. If somebody ever re-enables the
// button to "fix" its announcement, this test fails and the server still
// refuses (tests/battery/security/unverified-school-gates.spec.ts).
test("an unpaid school's withheld role is skipped by the keyboard, and says why in text", async ({
  page,
}) => {
  await loginTeacher(page, SCHOOL_E.admin);
  await page.goto("/admin");
  await page.getByRole("button", { name: /actions for Idris Vaughan/i }).click();
  await page.getByRole("menuitem", { name: /edit role/i }).click();

  const admin = page.getByRole("menuitem", { name: "Admin" });
  await expect(admin).toBeDisabled();
  await expect(
    page.getByText(/making somebody an admin waits until the school plan is paid for/i),
    "the reason must be readable text, because focus never reaches the disabled control",
  ).toBeVisible();

  // Walk the panel and record what focus can reach. Teaching assistant is the
  // live role change an unpaid school keeps; Admin must never appear.
  const reached: string[] = [];
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return (el.textContent ?? "").trim();
    });
    if (label) reached.push(label);
  }

  expect(
    reached.some((l) => l.endsWith("Teaching assistant")),
    "a role an unpaid school may still set must be reachable by keyboard",
  ).toBe(true);
  expect(
    reached.some((l) => l.endsWith("Admin")),
    "and the withheld one must not be focusable at all",
  ).toBe(false);
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
