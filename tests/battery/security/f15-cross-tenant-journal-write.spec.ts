import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, clearSession, loginTeacher, studentIdFromLogin } from "../helpers";

// ===========================================================================
// F15 — a teacher must not post into another school's journal
//
// createJournalItem() takes `studentId` from the form. The teacher branch
// resolved it with an UNSCOPED findUnique, then read classId off that student;
// the only remaining gate (requireWritableAccountForClass) checks the OWNING
// class's teacher's subscription, never the acting teacher. So a School B
// teacher could post into a School A pupil's journal — and because teacher
// items publish immediately (status: APPROVED), it landed past the approval
// queue, visible to School A's parents, without School A's teacher ever
// seeing it. SAFEGUARDING rules 3 (the queue is sacred), 4 (scope every child
// -data query by ownership) and 8 (deny by default).
//
// This is F1's twin: F1 fixed the STUDENT side of "trusted a client
// studentId". Note that the add-work PAGE is scoped correctly
// (src/app/teacher/students/[studentId]/new/page.tsx does a findFirst on
// class.teacherId → notFound), and tenant-isolation.spec.ts asserts exactly
// that. The UI route was closed; the server action behind it was not, and
// server actions are callable directly.
// ===========================================================================

const PROBE = "F15 cross-tenant probe — must never be written";

test("a teacher cannot post into another school's pupil's journal [F15]", async ({ page }) => {
  // Two real pupil ids, both obtained honestly from their own class's login.
  const amaraId = await studentIdFromLogin(page, SCHOOL_A.classCode, SCHOOL_A.student);
  const zaraId = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);
  await clearSession(page);

  // School B's teacher, on their OWN pupil's add-work page — a page they are
  // entitled to be on. Only the hidden studentId is tampered with.
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${zaraId}/new`);
  await page.getByRole("button", { name: "Write" }).click();
  await page.locator('input[name="studentId"]').evaluate((el, id) => {
    (el as HTMLInputElement).value = id as string;
  }, amaraId);
  await page.fill('textarea[name="textContent"]', PROBE);
  await page.getByRole("button", { name: /add to journal/i }).click();
  await page.waitForLoadState("networkidle");

  // The real assertion: whatever the UI did, nothing reached the child. Ask
  // School A's own teacher what is in Amara's journal.
  await clearSession(page);
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto(`/teacher/students/${amaraId}`);
  await expect(
    page.locator("body"),
    "a School B teacher wrote into a School A pupil's journal, bypassing the approval queue",
  ).not.toContainText(PROBE);

  // And it must not be sitting in School A's approval queue either — the point
  // is that it was never theirs to receive.
  await page.goto("/teacher/queue");
  await expect(page.locator("body")).not.toContainText(PROBE);
});
