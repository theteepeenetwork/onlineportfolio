import { test, expect } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, studentIdFromLogin } from "../helpers";

// ===========================================================================
// F1 (FIXED — regression guard) — studentLogin is bound to the class code
//
// studentLogin() now re-checks on the server that the chosen studentId belongs
// to the class whose code was entered (src/app/actions/auth.ts), so a pupil id
// alone — especially one from another school — can no longer mint a session.
// This test guards that fix: it swaps a School-A name-card's hidden studentId
// for a School-B pupil's id and asserts the cross-class login is refused.
// (Promoted from the findings project to the blocking security gate.)
// ===========================================================================

test("a pupil id from another class cannot be used to sign in [F1]", async ({ page }) => {
  // A real School B pupil id (Zara, class ACRN22), obtained honestly.
  const zaraId = await studentIdFromLogin(page, SCHOOL_B.classCode, SCHOOL_B.student);

  // Now go to School A's login for a DIFFERENT class (SUN234) and tamper with a
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
