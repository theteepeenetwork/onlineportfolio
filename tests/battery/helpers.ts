import { type Page, expect } from "@playwright/test";

// Known fixture accounts (see prisma/seed-test.ts). Passwords are all "password"
// — fictional test data only.
export const SCHOOL_A = {
  name: "St Bede’s Primary",
  admin: { email: "teacher@school.uk", password: "password" }, // also owns Sunflower
  otherTeacher: { email: "a.malik@stbedes.sch.uk", password: "password" }, // owns Butterflies
  classCode: "SUN123",
  student: "Amara",
  parentFamilyCode: "FAM123",
  // A media file owned by an APPROVED Sunflower moment (teacher@school.uk's class).
  approvedMedia: "/uploads/seed-sun.svg",
} as const;

export const SCHOOL_B = {
  name: "Oakfield Primary",
  admin: { email: "admin@oakfield.sch.uk", password: "password" },
  teacher: { email: "teacher@oakfield.sch.uk", password: "password" }, // owns Acorn
  classCode: "OAK111",
  student: "Zara",
  parentFamilyCode: "OAKFAM1",
  approvedMedia: "/uploads/seed-oak.svg", // APPROVED (Zara)
  pendingMedia: "/uploads/seed-oak-pending.svg", // PENDING (Yusuf)
  quizOptionMedia: "/uploads/seed-oak-quiz.svg", // a quiz answer picture (teacher-authored)
  quizPrompt: "Which picture shows the Oakfield oak leaf?", // distinctive text on School B's quiz
} as const;

// School C = Larchwood Primary — a FROZEN (lapsed) account. Read-only: the
// teacher can view/download but every write is blocked server-side.
export const SCHOOL_C = {
  name: "Larchwood Primary",
  teacher: { email: "teacher@larchwood.sch.uk", password: "password" }, // ADMIN, frozen
  classCode: "LRCH22",
  student: "Pip",
  approvedMedia: "/uploads/seed-larch.svg", // APPROVED before the freeze
} as const;

// Sign in as a teacher/admin by email + password, landing on their dashboard.
export async function loginTeacher(page: Page, who: { email: string; password: string }) {
  await page.goto("/login/teacher");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/teacher" || url.pathname === "/admin");
}

// Sign in as a parent with a family code, landing on the family home. The code
// form is revealed by a button, then submitted.
export async function loginParent(page: Page, familyCode: string) {
  await page.goto("/family");
  await page.getByRole("button", { name: /family code from your letter/i }).click();
  await page.getByLabel(/family code from your letter/i).fill(familyCode);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // Both signed-out and signed-in states live at /family, so wait for content
  // that only the signed-in ParentHome renders.
  await expect(page.getByRole("heading", { name: /grown-ups/i })).toBeVisible();
}

// Sign in as a student the intended way (enter code → tap name).
export async function loginStudent(page: Page, code: string, name: string) {
  await page.goto(`/login/student?code=${code}`);
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
}

// Read a pupil's server-issued id straight out of the class-code login page's
// hidden form field. Used by tenant-isolation / impersonation specs to obtain a
// real id without a direct DB query.
export async function studentIdFromLogin(page: Page, code: string, name: string): Promise<string> {
  await page.goto(`/login/student?code=${code}`);
  const card = page.getByRole("button", { name, exact: true });
  await expect(card).toBeVisible();
  const id = await card.locator("xpath=ancestor::form").locator('input[name="studentId"]').inputValue();
  expect(id).toBeTruthy();
  return id;
}

// Clear cookies to become anonymous.
export async function clearSession(page: Page) {
  await page.context().clearCookies();
}

// Fetch a same-origin URL from within the page (so the session cookie rides
// along) and return the HTTP status. The page must already be on our origin.
export async function fetchStatus(page: Page, url: string): Promise<number> {
  return page.evaluate((u) => fetch(u, { credentials: "include" }).then((r) => r.status), url);
}
