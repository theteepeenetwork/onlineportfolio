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

test.describe("A1 · Quiz option pictures are scoped like template media", () => {
  // A quiz answer-option picture is teacher-authored content living in
  // quizJson / quizSnapshotJson. It must be reachable by its own teacher and by
  // the pupils set the quiz, but by no other tenant and by NO parent (rule 7).
  const B_QUIZ = SCHOOL_B.quizOptionMedia;

  test("School B teacher can load their quiz option picture", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, B_QUIZ)).toBe(200);
  });

  test("A School B pupil set the quiz can load the option picture", async ({ page }) => {
    await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student); // Zara, in Acorn (wholeClass run)
    expect(await fetchStatus(page, B_QUIZ)).toBe(200);
  });

  test("School A teacher and admin CANNOT load School B's quiz option picture", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, B_QUIZ)).toBe(404);
    await loginTeacher(page, SCHOOL_A.admin);
    expect(await fetchStatus(page, B_QUIZ)).toBe(404);
  });

  test("No parent can load a quiz option picture (teacher content)", async ({ page }) => {
    // Even Zara's OWN parent — quiz option pictures are teacher/assessment content.
    await loginParent(page, SCHOOL_B.parentFamilyCode);
    expect(await fetchStatus(page, B_QUIZ)).toBe(404);
    await clearSession(page);
    await loginParent(page, SCHOOL_A.parentFamilyCode);
    expect(await fetchStatus(page, B_QUIZ)).toBe(404);
  });

  test("anonymous cannot load a quiz option picture", async ({ page }) => {
    await page.goto("/");
    await clearSession(page);
    expect(await fetchStatus(page, B_QUIZ)).toBe(404);
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

test.describe("A1 · Activity edit / preview are scoped across tenants", () => {
  // Grab a real School A template id the honest way: its own teacher's library
  // links each card to /teacher/activities/<id>.
  async function schoolATemplateId(page: import("@playwright/test").Page): Promise<string> {
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/teacher/activities");
    const href = await page
      .locator('a[href^="/teacher/activities/"]')
      .first()
      .getAttribute("href");
    const id = href?.split("/").pop();
    expect(id).toBeTruthy();
    await clearSession(page);
    return id!;
  }

  test("School B teacher gets 404 editing a School A template", async ({ page }) => {
    const id = await schoolATemplateId(page);
    await loginTeacher(page, SCHOOL_B.teacher);
    const res = await page.goto(`/teacher/activities/${id}/edit`);
    expect(res?.status()).toBe(404);
  });

  test("School B teacher gets 404 previewing a School A template", async ({ page }) => {
    const id = await schoolATemplateId(page);
    await loginTeacher(page, SCHOOL_B.teacher);
    const res = await page.goto(`/teacher/activities/${id}/preview`);
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
