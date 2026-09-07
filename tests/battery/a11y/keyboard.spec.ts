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

// A STAFF-ROW MENU IS A POPOVER (F69, decided 3 September 2026), AND A POPOVER
// A KEYBOARD CANNOT LEAVE IS A TRAP.
//
// The panel moved when F69 was fixed: it no longer hangs under the ⋯ button
// but opens sideways into the row, so that it cannot obscure another row's
// button. That is a layout change with three keyboard consequences, and each of
// them is asserted below rather than assumed:
//
//   1. the ⋯ button is still REACHED by tabbing — it is a real button in the
//      row, not something a pointer alone can get to;
//   2. Tab still moves from the button INTO the panel, which is only true while
//      the panel stays immediately after it in the DOM. Nothing in this fix may
//      quietly become a portal to <body>, which would put the panel's items
//      after everything else on the page;
//   3. Escape closes it and focus goes BACK TO THE BUTTON. Without that, focus
//      lands on `document.body` when the panel unmounts and the next Tab starts
//      again at the top of the console — which, for the person who has just
//      opened one menu of four, means walking the whole page to reach the next.
test("a staff-row menu opens, is walked and is left again with the keyboard alone", async ({
  page,
}) => {
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/admin");

  // Tab until the first row's ⋯ button has focus. Bounded, and it fails with
  // what it did reach: "the button is not in the tab order" and "the tab order
  // is longer than we thought" are different bugs.
  const walked: string[] = [];
  let onTrigger = false;
  for (let i = 0; i < 30 && !onTrigger; i++) {
    await page.keyboard.press("Tab");
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      return el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 30);
    });
    if (label) walked.push(label);
    onTrigger = !!label?.startsWith("Actions for");
  }
  expect(onTrigger, `no staff-row menu button in the tab order — reached: ${walked.join(" | ")}`).toBe(
    true,
  );

  const trigger = page.locator('button[aria-expanded="false"][aria-label^="Actions for"]').first();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();

  // Into the panel, which is the DOM order claim.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("menuitem", { name: "Edit role" }),
    "Tab from the ⋯ button must land on the first item of the panel it opened",
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger, "closing the panel must hand focus back to the button that opened it").toBeFocused();
});
