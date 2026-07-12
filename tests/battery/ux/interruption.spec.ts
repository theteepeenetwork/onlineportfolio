import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// B3 — Interruption resilience
//
// Teachers are interrupted constantly. A half-typed form or a mid-flow upload
// should survive a tab close/reopen or a flaky connection without silent data
// loss. These tests document how the app behaves today so regressions surface;
// where the app does NOT preserve a draft, the test records that expectation as
// a soft check (console note) rather than a hard failure, because draft
// persistence isn't yet a committed feature — see TEST_PLAN.md B3.
// ===========================================================================

test("a half-typed pupil name survives a reload without crashing the flow", async ({ page }) => {
  // Auto-dismiss any beforeunload prompt so the reload can't hang the test.
  page.on("dialog", (d) => d.accept().catch(() => {}));

  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();
  await page.getByRole("button", { name: /add pupil/i }).click();
  await page.locator('textarea[name="names"]').fill("Half-typed name");

  // Simulate an interruption: reload the page.
  await page.reload({ waitUntil: "domcontentloaded" });

  // F12 fix: the app restores your place (the open class + add-child panel) and
  // the half-typed draft survives the reload — no lost work.
  await expect(page.locator('textarea[name="names"]')).toBeVisible();
  await expect(page.locator('textarea[name="names"]')).toHaveValue(/Half-typed name/);
});

test("teacher login recovers gracefully from a flaky (offline→online) submit", async ({ page, context }) => {
  await page.goto("/login/teacher");
  await page.fill("#email", SCHOOL_A.admin.email);
  await page.fill("#password", SCHOOL_A.admin.password);

  // Drop the connection at the moment of submit, then restore it.
  await context.setOffline(true);
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForTimeout(300);
  await context.setOffline(false);

  // The app must not be permanently wedged. A fresh reload + clean login
  // recovers to the dashboard (no lost account, no corrupted state).
  await page.goto("/login/teacher");
  await page.fill("#email", SCHOOL_A.admin.email);
  await page.fill("#password", SCHOOL_A.admin.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/teacher" || url.pathname === "/admin", { timeout: 20000 });
});
