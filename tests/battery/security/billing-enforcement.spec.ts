import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_C, loginTeacher, loginStudent, fetchStatus } from "../helpers";

// ===========================================================================
// A8 — Billing access control (FROZEN = read-only), enforced server-side
//
// A frozen (lapsed) account must be blocked from EVERY mutation by the server
// gate requireWritableAccount(), while viewing and downloading approved work
// stay open (SAFEGUARDING rules 4 & 8; RETENTION.md frozen state). We drive the
// real UI so the assertion is that the *server* refused — not the client.
//
// School C (Larchwood) is seeded FROZEN. School A is on trial (full access), so
// the same flows succeed there — proving the gate discriminates on state, not
// on the flow.
// ===========================================================================

test.describe("A8 · Frozen account keeps read access", () => {
  test("a frozen teacher can load their dashboard and download their media", async ({ page }) => {
    await loginTeacher(page, SCHOOL_C.teacher);
    // Reading the journal is fine.
    const res = await page.goto("/teacher");
    expect(res?.status()).toBe(200);
    // Downloading approved media stays open (parents keep access to approved work).
    expect(await fetchStatus(page, SCHOOL_C.approvedMedia)).toBe(200);
  });

  test("the read-only banner is shown across the frozen teacher's area", async ({ page }) => {
    await loginTeacher(page, SCHOOL_C.teacher);
    await page.goto("/teacher");
    await expect(page.getByRole("status").filter({ hasText: /read-only/i })).toBeVisible();
  });
});

test.describe("A8 · Frozen account is blocked from mutations (server-side)", () => {
  test("a frozen teacher cannot create a class — the server refuses and none is made", async ({ page }) => {
    await loginTeacher(page, SCHOOL_C.teacher);
    await page.goto("/teacher/class");

    await page.getByRole("button", { name: /New class/i }).click();
    await page.fill("#className", "FrozenShouldFail");
    await page.getByRole("button", { name: /^Create class$/i }).click();

    // The server gate returns the read-only refusal (createClass never ran).
    await expect(page.getByRole("alert").filter({ hasText: /read-only|paused/i })).toBeVisible();

    // And no such class exists (reload to be sure it wasn't persisted).
    await page.goto("/teacher/class");
    await expect(page.locator("body")).not.toContainText("FrozenShouldFail");
  });

  test("a frozen pupil cannot add a moment — the server refuses", async ({ page }) => {
    await loginStudent(page, SCHOOL_C.classCode, SCHOOL_C.student);
    await page.goto("/student/new?type=TEXT");
    await page.fill('textarea[name="textContent"]', "please save me");
    await page.getByRole("button", { name: /add|save|done|✓/i }).first().click();

    // Blocked: we stay on the create page with the frozen message, and are NOT
    // redirected to the "popped in the jar" success page.
    await expect(page.locator("body")).toContainText(/paused/i);
    await expect(page).not.toHaveURL(/\/student\/popped/);
  });
});

test.describe("A8 · Account management stays available when frozen", () => {
  test("a frozen teacher can still edit their own profile (not write-gated)", async ({ page }) => {
    await loginTeacher(page, SCHOOL_C.teacher);
    await page.goto("/teacher/account");
    // Editing your own profile is account management — allowed in FROZEN
    // (RETENTION.md exception). The save must succeed server-side.
    await page.fill("#acc-name", "Ada Frost");
    await page.getByRole("button", { name: /Save changes/ }).click();
    await expect(page.getByText("Saved ✓")).toBeVisible();
  });
});

test.describe("A8 · A trial account (full access) can still write", () => {
  test("a trial pupil CAN add a moment (control for the frozen case)", async ({ page }) => {
    await loginStudent(page, SCHOOL_A.classCode, SCHOOL_A.student); // Amara, St Bede's (TRIAL)
    await page.goto("/student/new?type=TEXT");
    await page.fill('textarea[name="textContent"]', "my trial words");
    await page.getByRole("button", { name: /add|save|done|✓/i }).first().click();
    // Success path: the moment is created and we land on the confirmation page.
    await page.waitForURL(/\/student\/popped/);
  });
});
