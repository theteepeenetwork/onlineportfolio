import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, studentIdFromLogin } from "../helpers";

// ===========================================================================
// FINDING F1 (High) — studentLogin trusts a client-supplied studentId
//
// src/app/actions/auth.ts:studentLogin() takes `studentId` straight from the
// posted form and mints a STUDENT session for it, with NO check that the
// requester actually entered that pupil's class code. The class-code gate is
// only a page-render step, so a crafted submit can sign in as ANY pupil whose
// id is known — including a pupil in a DIFFERENT school.
//
// This test asserts the INTENDED secure behaviour (a studentId from another
// class must be refused), so it FAILS while the gap is open. It runs in the
// non-blocking `security-findings` project. When F1 is fixed, this test goes
// green — delete the finding from FINDINGS.md at that point.
//
// Repro: land on School A's login (SUN123), swap a name-card's hidden studentId
// for a School B pupil's id, submit. Securely this must NOT sign us in as the
// School B pupil.
// ===========================================================================

test("a pupil id from another class cannot be used to sign in [F1]", async ({ page }) => {
  // A real School B pupil id (Zara, class OAK111), obtained honestly.
  const zaraId = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);

  // Now go to School A's login for a DIFFERENT class (SUN123) and tamper with a
  // name-card's hidden studentId so it points at the School B pupil.
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);
  const firstForm = page.locator('form:has(input[name="studentId"])').first();
  await firstForm.locator('input[name="studentId"]').evaluate((el, id) => {
    (el as HTMLInputElement).value = id as string;
  }, zaraId);
  await firstForm.locator('button[type="submit"]').click();

  await page.waitForLoadState("networkidle");

  // SECURE expectation: the cross-class id is refused — we do NOT end up signed
  // in as Zara on the student home. (Today this FAILS: the app signs us in.)
  if (new URL(page.url()).pathname === "/student") {
    await expect(page.locator("body"), "signed in as a pupil from another school via a swapped id").not.toContainText(
      SCHOOL_B.student,
    );
  }
});
