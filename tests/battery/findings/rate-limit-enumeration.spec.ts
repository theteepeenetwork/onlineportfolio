import { test, expect } from "@playwright/test";
import { SCHOOL_A } from "../helpers";

// ===========================================================================
// F2 & F6 (FIXED — regression guards) — rate limiting & no enumeration
//
// Login, family-code sign-in and magic-link requests are now throttled by a
// failure-count limiter (src/lib/rateLimit.ts), and requestMagicLink returns a
// neutral response that never discloses whether an email is on file.
//
// These tests deliberately trip the throttle (many wrong attempts), which sets
// a real 15-minute block in the shared dev-server process. That would
// contaminate sibling logins in the gating run, so this spec stays in the
// REPORT-ONLY `security-findings` project rather than the blocking gate.
// ===========================================================================

const THROTTLE = /too many|slow down|locked|try again later|rate.?limit/i;

test("teacher login throttles after repeated wrong passwords [F2]", async ({ page }) => {
  await page.goto("/login/teacher");
  const submit = page.locator('button[type="submit"]');
  let sawNormalRejection = false;
  let throttled = false;

  for (let i = 0; i < 8; i++) {
    await page.fill("#email", SCHOOL_A.admin.email);
    await page.fill("#password", `wrong-${i}`);
    await submit.click();
    // Wait for the action to complete (the button un-disables) — robust and
    // race-free vs. waiting on the response.
    await expect(submit).toBeEnabled();
    const body = await page.locator("body").innerText();
    if (/password don.?t match/i.test(body)) sawNormalRejection = true;
    if (THROTTLE.test(body)) {
      throttled = true;
      break;
    }
  }

  // Guard: prove the loop actually exercised login (not a silent no-op).
  expect(sawNormalRejection, "login attempts were processed").toBe(true);
  // Now-fixed (F2): brute force is throttled after repeated failures.
  expect(throttled, "expected login to throttle after many failed attempts").toBe(true);
});

test("magic-link request does not reveal whether an email is on file [F6]", async ({ page }) => {
  await page.goto("/family");

  await page.getByLabel(/email your school has on file/i).fill("nobody-here@example.com");
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST"),
    page.getByRole("button", { name: /magic link/i }).click(),
  ]);
  // Wait for whichever response the app renders (error alert today, or a neutral
  // note once fixed).
  await Promise.race([
    page.getByRole("alert").first().waitFor({ state: "visible" }),
    page.getByText(/check your inbox|sent/i).first().waitFor({ state: "visible" }),
  ]);
  const msg = await page.locator("form:has(#pl-email)").innerText();

  // Guard: prove we captured a real response.
  expect(msg.length, "captured a response message").toBeGreaterThan(0);
  // SECURE expectation (FAILS today): the response must not disclose non-existence.
  // (`.` matches either a straight or curly apostrophe in the app's copy.)
  expect(
    /find a family|no family|not found/i.test(msg),
    "response discloses that the email is not registered (enumeration)",
  ).toBe(false);
});

test("family-code sign-in throttles brute force [F2]", async ({ page }) => {
  await page.goto("/family");
  await page.getByRole("button", { name: /family code from your letter/i }).click();

  const signIn = page.getByRole("button", { name: /^sign in$/i });
  let sawNormalRejection = false;
  let throttled = false;
  for (let i = 0; i < 8; i++) {
    await page.getByLabel(/family code from your letter/i).fill(`BAD${i}23`);
    await signIn.click();
    await expect(signIn).toBeEnabled();
    const body = await page.locator("body").innerText();
    if (/isn.?t right/i.test(body)) sawNormalRejection = true;
    if (THROTTLE.test(body)) {
      throttled = true;
      break;
    }
  }

  expect(sawNormalRejection, "family-code attempts were processed").toBe(true);
  expect(throttled, "expected family-code sign-in to throttle brute force").toBe(true);
});
