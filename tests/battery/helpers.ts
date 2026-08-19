import { type Cookie, type Page, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { codeForStep, totpStepAt } from "@/lib/ops/totp";

// Known fixture accounts (see prisma/seed-test.ts). Passwords are all "password"
// — fictional test data only.
export const SCHOOL_A = {
  name: "St Bede’s Primary",
  admin: { email: "teacher@school.uk", password: "password" }, // also owns Sunflower
  otherTeacher: { email: "a.malik@stbedes.sch.uk", password: "password" }, // owns Butterflies
  classCode: "SUN234",
  student: "Amara",
  parentFamilyCode: "FAM123",
  // A media file owned by an APPROVED Sunflower moment (teacher@school.uk's class).
  approvedMedia: "/uploads/seed-sun.svg",
} as const;

export const SCHOOL_B = {
  name: "Oakfield Primary",
  admin: { email: "admin@oakfield.sch.uk", password: "password" },
  teacher: { email: "teacher@oakfield.sch.uk", password: "password" }, // owns Acorn
  classCode: "ACRN22",
  student: "Zara",
  parentFamilyCode: "OAKFAM1",
  approvedMedia: "/uploads/seed-oak.svg", // APPROVED (Zara)
  pendingMedia: "/uploads/seed-oak-pending.svg", // PENDING (Yusuf)
  approvedAudio: "/uploads/seed-oak-voice.m4a", // an APPROVED voice note (Zara)
  pendingAudio: "/uploads/seed-oak-voice-pending.webm", // a PENDING voice note (Yusuf)
  quizOptionMedia: "/uploads/seed-oak-quiz.svg", // a quiz answer picture (teacher-authored)
  objectMedia: "/uploads/seed-oak-object.svg", // a movable-object picture on the template (teacher-authored)
  templateMedia: "/uploads/seed-oak-tmpl-bg.svg", // the template BACKGROUND — teacher-authored, its own file (never a child's response media)
  quizPrompt: "Which picture shows the Oakfield oak leaf?", // distinctive text on School B's quiz
  childDraftMedia: "/uploads/seed-oak-draft.svg", // Zara's in-progress response draft — Zara ONLY
  teacherDraftMedia: "/uploads/seed-oak-tmpl-draft.svg", // Okafor's template draft — Okafor ONLY
} as const;

// POST a same-origin JSON body from within the page (so the session cookie
// rides along) and return the HTTP status. The page must already be on our
// origin. Used to exercise POST endpoints (e.g. /api/drafts) in isolation specs.
export async function postStatus(page: Page, url: string, body: unknown): Promise<number> {
  return page.evaluate(
    async ({ u, b }) => {
      const r = await fetch(u, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      });
      return r.status;
    },
    { u: url, b: body },
  );
}

// Read a real assignment id the honest way — from a student's activities list.
export async function firstAssignmentId(page: Page, code: string, name: string): Promise<string> {
  await loginStudent(page, code, name);
  await page.goto("/student/activities");
  const href = await page.locator('a[href^="/student/activities/"]').first().getAttribute("href");
  return href?.split("/").pop() ?? "";
}

// School C = Larchwood Primary — a FROZEN (lapsed) account. Read-only: the
// teacher can view/download but every write is blocked server-side.
export const SCHOOL_C = {
  name: "Larchwood Primary",
  teacher: { email: "teacher@larchwood.sch.uk", password: "password" }, // ADMIN, frozen
  classCode: "ARCH22",
  student: "Pip",
  approvedMedia: "/uploads/seed-larch.svg", // APPROVED before the freeze
  // The only fixture school with Stripe ids: it went through checkout once and
  // then lapsed. St Bede's and Oakfield have none, which is what makes the
  // operator billing screen's "Stripe holds nothing for this school" state
  // testable in the same render as a working link.
  stripeCustomerId: "cus_seedlarchwood0001",
  stripeSubscriptionId: "sub_seedlarchwood0001",
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

// Headers that give a browser context its OWN rate-limit key.
//
// The auth limiters key on `clientIp()`, which reads the leftmost
// `x-forwarded-for`. A spec that deliberately trips a limiter would otherwise
// leave a real 15-minute block on the key every other spec shares, which is why
// the throttle specs that grind the shared key live in the report-only
// `findings` project. Nominating a key lets a spec prove the same behaviour in
// the blocking gate without contaminating anything.
//
// The key is unique PER RUN, and that part is not decoration: the dev server is
// reused between runs locally (see TESTING.md on warm vs cold servers), so a
// fixed key would hand the next run the block the last one left behind, and the
// spec would fail on its first attempt for a reason that has nothing to do with
// the code.
//
// `clientIp()` treats the value as an opaque string, so the suffix is harmless.
// This is a local test seam only: the live edge discards a client-supplied
// `x-forwarded-for` before the app sees it (verified, see src/lib/rateLimit.ts).
export function ownThrottleKey(label: string): Record<string, string> {
  return { "x-forwarded-for": `203.0.113.${label}-${Date.now()}` };
}

// ---------------------------------------------------------------------------
// The platform operator fixture (PR1). See prisma/seed-test.ts.
//
// HOW A TEST AUTHENTICATES WITHOUT A BYPASS, WHICH IS THE WHOLE POINT
//
// There is no SKIP_TOTP, no NODE_ENV === "test" branch and no fixture flag in
// the sign-in path; handbook ruling R6 deleted the proposal for one. A test
// gets in the same way a person does: it knows the password, and it holds the
// TOTP secret, so it can compute a real six-digit code with the same library
// the server verifies against. If that is awkward, the awkwardness is the
// feature: it is the same awkwardness an attacker meets.
// ---------------------------------------------------------------------------
export const OPERATOR = {
  email: "ops@storyjar.test",
  password: "fixture-operator-pass-9271",
  totpSecret: "GBX7MIWQ6ZXBKEIOGA2JYJPNCND2HCHN",
  // The plaintext of the ten bcrypt hashes in prisma/seed-test.ts, in order.
  recoveryCodes: [
    "V5ZZ-JCJE-FQCN",
    "855D-ECC2-C3ZV",
    "PEWY-XZ8W-3SXF",
    "QW55-KRFB-CTXN",
    "6RZS-QJDX-QNXJ",
    "3M47-N6E5-7ZRX",
    "ZRJE-BTG5-ATV3",
    "PCDY-Q39P-443D",
    "TMW9-9Y2F-RYQK",
    "GK9G-CANK-H4XA",
  ],
  // The cookie name in development, where Secure cannot be set over http and a
  // __Host- cookie would therefore be refused by the browser. Production uses
  // __Host-sj_ops; the rule that ties the two together is asserted directly
  // from src/lib/ops/cookie.ts in ops-auth.spec.ts.
  cookie: "sj_ops",
} as const;

// A genuine TOTP code, one step ahead of whatever the operator row has already
// accepted.
//
// Replay protection is monotonic: a step less than OR EQUAL to the last
// accepted one is refused, which is correct and which means two sign-ins inside
// the same 30-second step cannot use the same code. Rather than sleeping for
// half a minute, this uses the NEXT step's code, which a real authenticator
// would show shortly and which the plus-or-minus-one window accepts. Only when
// that would be two steps ahead does it wait, and then only for the remainder
// of the current step.
export async function operatorCode(): Promise<string> {
  const db = new PrismaClient();
  let last: number;
  try {
    const row = await db.operator.findUnique({
      where: { email: OPERATOR.email },
      select: { lastTotpStep: true },
    });
    last = row?.lastTotpStep ?? -1;
  } finally {
    await db.$disconnect();
  }
  const step = Math.max(totpStepAt(), last + 1);
  while (step > totpStepAt() + 1) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  return codeForStep(OPERATOR.totpSecret, step);
}

// Sign in as the operator exactly as a person would: email, password, then a
// code from the authenticator. Lands on the console.
//
// ONE CODE, ONE ATTEMPT, ON PURPOSE. A retry loop was tried here on 17 August
// 2026 and reverted the same day, because it makes a bad run much worse rather
// than better: every refused code counts a failure on the operator's own row,
// five of those lock the account, and a lockout turns two red tests into
// fourteen. If the door refuses a genuine code, that is worth seeing once,
// loudly, rather than papering over three times.
export async function signInOperator(page: Page) {
  // From no session: the door renders three different things depending on what
  // the browser already holds, so a half-finished sign-in left by an earlier
  // step would leave no email field to type into.
  await page.context().clearCookies();
  await page.goto("/ops/sign-in");
  await page.fill("#email", OPERATOR.email);
  await page.fill("#password", OPERATOR.password);
  await page.getByRole("button", { name: /continue/i }).click();
  await expect(page.getByLabel(/6-digit code/i)).toBeVisible();
  await page.fill("#code", await operatorCode());
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => url.pathname === "/ops");
}

// ---------------------------------------------------------------------------
// BEING the operator, for the tests that are not about the door
//
// `signInOperator` above walks the whole door and stays that way: ops-auth.spec
// and ops-auth-a11y.spec are ABOUT the door, and they must keep paying for it.
//
// Every other ops test only needs to already be signed in, and paying the door
// for each of those was the battery's single biggest cost. Replay protection is
// monotonic, so two sign-ins inside one 30-second step cannot use the same code;
// `operatorCode()` borrows the NEXT step's code and, when that would be two
// steps ahead, waits for the clock. Across the ~90 sign-ins in the security and
// a11y projects that wait WAS the suite: 1,197 of the a11y project's 1,305
// seconds of test time, and most of security's, spent watching a clock.
//
// So the door is walked once per worker and the session it produced is reused,
// which is exactly what an operator does — sign in in the morning, work all day
// (30-minute idle, 8-hour absolute; see src/lib/ops/session.ts).
//
// NOTHING IS SKIPPED. The password is still typed, a genuine TOTP code is still
// computed from the seeded secret and accepted by the real verifier, and the
// session is a real session issued by the real door. Handbook ruling R6 forbids
// a way PAST the door; this is the door, once. There is still no SKIP_TOTP, no
// test branch in the sign-in path and no fixture flag — take the seed's secret
// away and every one of these tests stops working.
//
// It is also self-healing rather than trusting: the cached session is proved on
// use by loading the console and looking for it, and anything else — expiry, a
// wiped fixture, a worker that inherited a stale cookie — falls back to the full
// door and re-caches. A cached session can therefore never turn a failure into a
// pass.
let cachedOpsSession: Cookie[] | null = null;

export async function asOperator(page: Page) {
  await page.context().clearCookies();

  if (cachedOpsSession) {
    await page.context().addCookies(cachedOpsSession);
    await page.goto("/ops");
    // The console's own landmark, not the URL: an unauthorised /ops answers 404
    // at the same address, which is the point of the area and would otherwise
    // read as success here.
    const signedIn = await page
      .getByRole("navigation", { name: /operations/i })
      .isVisible()
      .catch(() => false);
    if (signedIn) return;
    cachedOpsSession = null;
    await page.context().clearCookies();
  }

  await signInOperator(page);
  cachedOpsSession = (await page.context().cookies()).filter((c) => c.name === OPERATOR.cookie);
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
