import { test, expect } from "@playwright/test";
import {
  SCHOOL_A,
  SCHOOL_B,
  loginTeacher,
  loginParent,
  loginStudent,
  studentIdFromLogin,
  clearSession,
  fetchStatus,
} from "../helpers";

// ===========================================================================
// A1 — Access control / tenant isolation (HIGHEST PRIORITY)
//
// A user in School B must NEVER read, write or enumerate School A's pupils,
// journals or media — and vice versa (SAFEGUARDING.md rules 4–7). These tests
// drive the real auth boundaries across the tenant seam:
//   media route (/uploads), student-journal IDOR, admin console scoping.
// ===========================================================================

test.describe("A1 · Media route is scoped across tenants (/uploads)", () => {
  // School B's APPROVED media (Zara's oak drawing).
  const B_APPROVED = SCHOOL_B.approvedMedia;
  // School B's PENDING media (Yusuf's) — not yet approved, so even a linked
  // parent must not see it (rule 3: nothing seen before approval).
  const B_PENDING = SCHOOL_B.pendingMedia;

  test("School B's own teacher can load School B media", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, B_APPROVED)).toBe(200);
    // The teacher may also see pending work in their own class.
    expect(await fetchStatus(page, B_PENDING)).toBe(200);
  });

  test("School A teacher CANNOT load School B media", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, B_APPROVED)).toBe(404);
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });

  test("School A admin CANNOT load School B media (admins aren't all-seeing)", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.admin); // ADMIN of St Bede's
    expect(await fetchStatus(page, B_APPROVED)).toBe(404);
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });

  test("School B's linked parent sees approved-only, never pending", async ({ page }) => {
    await loginParent(page, SCHOOL_B.parentFamilyCode); // Nadia → Zara
    expect(await fetchStatus(page, B_APPROVED)).toBe(200);
    // Rule 3: a pending moment is invisible even to the child's own parent.
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });

  test("School A's parent CANNOT load School B media", async ({ page }) => {
    await loginParent(page, SCHOOL_A.parentFamilyCode); // Priya (St Bede's)
    expect(await fetchStatus(page, B_APPROVED)).toBe(404);
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });

  test("School B teacher CANNOT load School A media", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, SCHOOL_A.approvedMedia)).toBe(404);
  });

  test("anonymous is refused everything (deny by default)", async ({ page }) => {
    await page.goto("/"); // an origin to fetch from, signed out
    await clearSession(page);
    expect(await fetchStatus(page, B_APPROVED)).toBe(404);
    expect(await fetchStatus(page, SCHOOL_A.approvedMedia)).toBe(404);
  });
});

test.describe("A1 · Student-journal IDOR across tenants", () => {
  test("School B teacher gets 404 for a School A pupil's journal", async ({ page }) => {
    // Obtain a real School A pupil id the honest way (its login name-card).
    const amaraId = await studentIdFromLogin(page, SCHOOL_A.classCode, SCHOOL_A.student);

    await loginTeacher(page, SCHOOL_B.teacher);
    const res = await page.goto(`/teacher/students/${amaraId}`);
    // Ownership-scoped query → notFound() for another tenant's pupil.
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText(SCHOOL_A.student);
  });

  test("School B teacher cannot open the add-work page for a School A pupil", async ({ page }) => {
    const amaraId = await studentIdFromLogin(page, SCHOOL_A.classCode, SCHOOL_A.student);
    await loginTeacher(page, SCHOOL_B.teacher);
    const res = await page.goto(`/teacher/students/${amaraId}/new`);
    expect(res?.status()).toBe(404);
  });
});

test.describe("A1 · Admin console is school-scoped", () => {
  test("School B admin sees only Oakfield staff, never St Bede's", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.admin);
    await page.goto("/admin");
    const body = page.locator("body");
    // Their own school is present…
    await expect(body).toContainText(/Oakfield/i);
    // …St Bede's staff/emails are not.
    await expect(body).not.toContainText("a.malik@stbedes.sch.uk");
    await expect(body).not.toContainText("St Bede");
  });

  test("A non-admin teacher is bounced off /admin", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.teacher); // TEACHER, not ADMIN
    await page.goto("/admin");
    // requireAdmin() redirects a non-admin away from the console.
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});
