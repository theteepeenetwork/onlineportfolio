import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_A, loginStudent } from "../helpers";

// ===========================================================================
// A9 — No Stripe / billing code on child-facing pages
//
// Billing lives only in the teacher/admin area. The class-code login and the
// child journal views must never load Stripe.js or expose a Stripe global, and
// must set no billing cookies (PECR: essential cookies only). Purchase happens
// on Stripe's hosted Checkout via redirect, so no page embeds Stripe.js at all —
// we assert that explicitly for the pages children use.
// ===========================================================================

async function assertNoStripe(page: Page) {
  // No script element points at Stripe.
  const stripeScripts = await page.$$eval("script[src]", (els) =>
    els.map((e) => (e as HTMLScriptElement).src).filter((s) => /stripe\.com/i.test(s)),
  );
  expect(stripeScripts, "no <script> should load from stripe.com").toEqual([]);

  // No Stripe global was injected.
  const hasStripeGlobal = await page.evaluate(() => "Stripe" in window && Boolean((window as unknown as { Stripe?: unknown }).Stripe));
  expect(hasStripeGlobal, "window.Stripe must not exist on child pages").toBe(false);

  // No Stripe cookies were set.
  const cookies = await page.context().cookies();
  expect(cookies.filter((c) => /stripe|__stripe|__Secure-stripe/i.test(c.name)), "no Stripe cookies").toEqual([]);
}

test("class-code login page loads no Stripe.js", async ({ page }) => {
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);
  await assertNoStripe(page);
});

test("the child journal home loads no Stripe.js", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, SCHOOL_A.student);
  await page.goto("/student");
  await assertNoStripe(page);
});

test("the child add-work page loads no Stripe.js", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, SCHOOL_A.student);
  await page.goto("/student/new?type=TEXT");
  await assertNoStripe(page);
});
