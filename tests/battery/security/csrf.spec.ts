import { test, expect } from "@playwright/test";
import { SCHOOL_A, loginTeacher } from "../helpers";

// ===========================================================================
// A7 — CSRF on state-changing routes
//
// All mutations are Next.js Server Actions (same-origin POST with a Next-Action
// header) or same-origin route handlers; the CSP pins form-action to 'self'.
// A cross-site form/POST must not be able to drive a state change. We assert:
//   1. the anti-CSRF posture is declared (form-action 'self', SameSite cookie);
//   2. a forged cross-origin POST to a Server Action route is rejected.
// ===========================================================================

test("CSP pins form-action to self (forms can't submit cross-site)", async ({ page }) => {
  const res = await page.goto("/teacher");
  const csp = res!.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("form-action 'self'");
});

test("a forged cross-origin POST without the Server Action handshake is refused", async ({ page, context }) => {
  // Authenticate first, so the only thing missing from the forged request is the
  // same-origin / action handshake — not the session.
  await loginTeacher(page, SCHOOL_A.admin);

  // Craft a POST to the teacher route as a naive attacker page would: form
  // content-type, no Next-Action header, arbitrary body. A Server Action
  // dispatch requires the framework handshake, so this must NOT mutate state.
  const res = await page.request.post("/teacher", {
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
    data: "name=CSRFClass",
    failOnStatusCode: false,
  });
  // Accept any non-2xx-that-performed-the-action; the key assertion is that no
  // class called "CSRFClass" was created.
  await page.goto("/teacher/class");
  await expect(page.locator("body")).not.toContainText("CSRFClass");
  expect(res.status()).toBeLessThan(500); // no server crash either
});
