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
  postStatus,
  firstAssignmentId,
} from "../helpers";

// A 1×1 transparent PNG — a valid data:image for a draft-save request body.
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

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

// The thing the two describes below say they are "like". Until now there was no
// fixture for a template BACKGROUND and no test of it — so "scoped like template
// media" was mirroring coverage that did not exist. The background is the
// worksheet a child actually draws on: teacher-authored, reachable by its owner
// and by the pupils set the activity, and by nobody else.
test.describe("A1 · Template backgrounds are scoped by ownership and assignment", () => {
  const B_TMPL = SCHOOL_B.templateMedia;

  test("School B teacher can load their own template background", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, B_TMPL)).toBe(200);
  });

  // The case the seed collision broke: a child set the activity could not load
  // the worksheet they were meant to draw on, because the path was also another
  // child's response media and /uploads authorises path-first.
  test("A School B pupil set the activity can load the background they draw on", async ({ page }) => {
    await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student); // Zara, Acorn (wholeClass run)
    expect(await fetchStatus(page, B_TMPL)).toBe(200);
  });

  test("School A teacher and admin CANNOT load School B's template background", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, B_TMPL)).toBe(404);
    await loginTeacher(page, SCHOOL_A.admin);
    expect(await fetchStatus(page, B_TMPL)).toBe(404);
  });

  test("A School A pupil cannot load School B's template background", async ({ page }) => {
    await loginStudent(page, SCHOOL_A.classCode, SCHOOL_A.student);
    expect(await fetchStatus(page, B_TMPL)).toBe(404);
  });

  test("No parent can load a template background (teacher content)", async ({ page }) => {
    await loginParent(page, SCHOOL_B.parentFamilyCode);
    expect(await fetchStatus(page, B_TMPL)).toBe(404);
    await clearSession(page);
    await loginParent(page, SCHOOL_A.parentFamilyCode);
    expect(await fetchStatus(page, B_TMPL)).toBe(404);
  });

  test("anonymous cannot load a template background", async ({ page }) => {
    await page.goto("/");
    await clearSession(page);
    expect(await fetchStatus(page, B_TMPL)).toBe(404);
  });
});

test.describe("A1 · Movable-object pictures are scoped like template media", () => {
  // A picture the teacher placed on the template as a draggable/lockable object.
  // It is teacher-authored content living in objectsJson / objectsSnapshotJson,
  // scoped exactly like template pages and quiz option pictures: reachable by its
  // own teacher and the pupils set the activity, by no other tenant, no parent.
  const B_OBJ = SCHOOL_B.objectMedia;

  test("School B teacher can load their template object picture", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, B_OBJ)).toBe(200);
  });

  test("A School B pupil set the activity can load the object picture", async ({ page }) => {
    await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student); // Zara, in Acorn (wholeClass run)
    expect(await fetchStatus(page, B_OBJ)).toBe(200);
  });

  test("School A teacher and admin CANNOT load School B's object picture", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, B_OBJ)).toBe(404);
    await loginTeacher(page, SCHOOL_A.admin);
    expect(await fetchStatus(page, B_OBJ)).toBe(404);
  });

  test("No parent can load a template object picture (teacher content)", async ({ page }) => {
    await loginParent(page, SCHOOL_B.parentFamilyCode);
    expect(await fetchStatus(page, B_OBJ)).toBe(404);
    await clearSession(page);
    await loginParent(page, SCHOOL_A.parentFamilyCode);
    expect(await fetchStatus(page, B_OBJ)).toBe(404);
  });

  test("anonymous cannot load a template object picture", async ({ page }) => {
    await page.goto("/");
    await clearSession(page);
    expect(await fetchStatus(page, B_OBJ)).toBe(404);
  });
});

test.describe("A1 · Cross-device drafts are owner-only", () => {
  // A CHILD's in-progress draft is their private unfinished work — visible to
  // that child ONLY, never to their teacher, a parent, or another tenant.
  const CHILD_DRAFT = SCHOOL_B.childDraftMedia;
  const TEACHER_DRAFT = SCHOOL_B.teacherDraftMedia;

  test("a child can load their own draft page; their own teacher cannot", async ({ page }) => {
    await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student); // Zara owns it
    expect(await fetchStatus(page, CHILD_DRAFT)).toBe(200);
    // Even Oakfield's own teacher can't see a pupil's UNSUBMITTED draft.
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, CHILD_DRAFT)).toBe(404);
  });

  test("no parent, no other tenant, and no anonymous user can load a child draft", async ({ page }) => {
    await loginParent(page, SCHOOL_B.parentFamilyCode); // Zara's own parent
    expect(await fetchStatus(page, CHILD_DRAFT)).toBe(404);
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, CHILD_DRAFT)).toBe(404);
    await loginTeacher(page, SCHOOL_A.admin);
    expect(await fetchStatus(page, CHILD_DRAFT)).toBe(404);
    await page.goto("/");
    await clearSession(page);
    expect(await fetchStatus(page, CHILD_DRAFT)).toBe(404);
  });

  test("a teacher's template draft is theirs only", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, TEACHER_DRAFT)).toBe(200);
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, TEACHER_DRAFT)).toBe(404);
    await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student);
    expect(await fetchStatus(page, TEACHER_DRAFT)).toBe(404);
  });

  test("a child cannot save a draft against another school's activity (POST IDOR)", async ({ page }) => {
    // Grab a real School A assignment id the honest way.
    const schoolAAssignment = await firstAssignmentId(page, SCHOOL_A.classCode, SCHOOL_A.student);
    expect(schoolAAssignment).toBeTruthy();
    // Now as a School B pupil, try to save a response draft for it → rejected.
    await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student);
    await page.goto("/student");
    const status = await postStatus(page, "/api/drafts", {
      surface: "ACTIVITY_RESPONSE",
      contextKey: schoolAAssignment,
      pages: [TINY_PNG],
      fields: {},
    });
    expect(status).toBe(400); // resolveScope denies: the run doesn't target this child
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
