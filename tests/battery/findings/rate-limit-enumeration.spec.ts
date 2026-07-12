import { test, expect } from "@playwright/test";
import { SCHOOL_A } from "../helpers";

// ===========================================================================
// FINDINGS F2 (High) & F6 (Low) — no rate limiting; user-enumeration
//
// There is no throttling on teacher login, parent family-code sign-in, magic-
// link requests, or the class-code lookup (F2) — brute force and enumeration
// are unbounded. And requestMagicLink reveals whether an email is on file (F6).
//
// These assert the INTENDED behaviour (throttling; non-revealing responses), so
// they FAIL today. Non-blocking `security-findings` project. Per the agreed
// plan, rate limiting is logged, not silently added — see FINDINGS.md.
//
// Each test is written to be DETERMINISTIC: it waits for every submission's POST
// to complete and asserts the mechanism actually engaged (a guard), so a pass
// can only mean the gap is genuinely closed — never a timing fluke.
// ===========================================================================

const THROTTLE = /too many|slow down|locked|try again later|rate.?limit/i;

test("teacher login throttles after repeated wrong passwords [F2]", async ({ page }) => {
  await page.goto("/login/teacher");
  let sawNormalRejection = false;
  let throttled = false;

  for (let i = 0; i < 15; i++) {
    await page.fill("#email", SCHOOL_A.admin.email);
    await page.fill("#password", `wrong-${i}`);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.click('button[type="submit"]'),
    ]);
    const body = await page.locator("body").innerText();
    if (/email and password don'?t match/i.test(body)) sawNormalRejection = true;
    if (THROTTLE.test(body)) {
      throttled = true;
      break;
    }
  }

  // Guard: prove the loop actually exercised login (not a silent no-op).
  expect(sawNormalRejection, "login attempts were processed").toBe(true);
  // SECURE expectation (FAILS today): brute force is eventually throttled.
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
  expect(
    /couldn'?t find a family|no family|not found/i.test(msg),
    "response discloses that the email is not registered (enumeration)",
  ).toBe(false);
});

test("family-code sign-in throttles brute force [F2]", async ({ page }) => {
  await page.goto("/family");
  await page.getByRole("button", { name: /family code from your letter/i }).click();

  let sawNormalRejection = false;
  let throttled = false;
  for (let i = 0; i < 15; i++) {
    await page.getByLabel(/family code from your letter/i).fill(`BAD${i}23`);
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.getByRole("button", { name: /^sign in$/i }).click(),
    ]);
    const body = await page.locator("body").innerText();
    if (/isn'?t right/i.test(body)) sawNormalRejection = true;
    if (THROTTLE.test(body)) {
      throttled = true;
      break;
    }
  }

  expect(sawNormalRejection, "family-code attempts were processed").toBe(true);
  expect(throttled, "expected family-code sign-in to throttle brute force").toBe(true);
});
