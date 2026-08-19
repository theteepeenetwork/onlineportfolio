import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, SCHOOL_C, loginTeacher, asOperator } from "../helpers";
import { BATTERY_STRIPE_KEY } from "../stripeFixtureKey";
import { stripeLiveMode } from "@/lib/stripeMode";
import { MIN_CELL } from "@/lib/ops/dto";
import {
  STRIPE_DASHBOARD_ORIGIN,
  customerLink,
  dashboardLink,
  isStripeId,
  stripeModeStatement,
  stripeRef,
  subscriptionLink,
  type StripeMode,
} from "@/lib/ops/stripeLinks";

// ===========================================================================
// A25 - Billing visibility, read-only, with a link out to Stripe (PR3)
//
// Owner decision D6, 17 August 2026 (docs/ops-architecture.md): manual payment
// recording is dropped from v1, because StoryJar's Subscription row is a mirror
// written by the Stripe webhook and anything an operator typed into it would be
// reverted by the next event without saying so. So this suite proves two things
// that pull in opposite directions: that the billing state is really there and
// really readable, and that there is no way whatsoever to change it from here.
//
// Every negative is paired with a positive control, and for the operator area
// the pairing axis is ROLE rather than tenant (handbook section 6 item 3): the
// same URL, the same fixture, two sessions. This area answers 404 to everything
// it dislikes, which is exactly the condition under which a route that has
// stopped existing looks like a working guard.
//
// WHAT THE FIXTURES MAKE PROVABLE
//
//   St Bede's Primary   12 pupils, TRIAL,  no Stripe ids  -> exact headcount
//                                                            shown; "Stripe
//                                                            holds nothing"
//   Oakfield Primary     3 pupils, TRIAL,  no Stripe ids  -> headcount withheld
//   Larchwood Primary    3 pupils, FROZEN, both Stripe ids -> both links, and it
//                                                            sorts to the top
//
// So the suppression rule and the link-or-explain rule are each asserted in
// BOTH directions in the same render, which is the only way to know the rule is
// doing the work rather than the thing simply being absent.
//
// Oakfield's billing STATUS is deliberately never asserted here:
// stripe-webhook.spec.ts rewrites that row when Stripe credentials are present.
// Its headcount, which is what this suite needs from it, is untouched by that.
//
// HOW THIS SPEC SIGNS IN: as a person does, with the password and a real TOTP
// code computed from the seeded secret. There is no bypass (ruling R6).
// ===========================================================================

const ROUTE = "/ops/billing";

// The mode the battery's own server runs in, derived from the key
// playwright.battery.config.ts hands it rather than from this process's
// environment, which is a different environment and would quietly disagree.
const BATTERY_MODE: StripeMode = stripeLiveMode({ STRIPE_SECRET_KEY: BATTERY_STRIPE_KEY })
  ? "live"
  : "test";

// A warm dev server started outside the battery does not have that key. That is
// the same trap TESTING.md describes for OPS_ENABLED, so it gets the same
// treatment: a message that names the cause rather than a puzzling diff.
const WARM_SERVER_HINT =
  "If this failed on a warm dev server, it was started without STRIPE_SECRET_KEY. " +
  "Kill it and let the battery start its own: pkill -f 'next dev'.";

const CHILD_NAMES = [
  "Amara", "Ben", "Chloe", "Dev", "Ella", "Finn", "Grace", "Harry", "Isla",
  "Ava", "Theo", "Mia", "Zara", "Yusuf", "Willow", "Pip", "Robin", "Sage",
];
const CLASS_NAMES = ["Sunflower", "Ladybird", "Acorns", "Butterflies", "Acorn Class", "Willow Class"];
const CODES = [
  SCHOOL_A.classCode,
  SCHOOL_B.classCode,
  SCHOOL_C.classCode,
  SCHOOL_A.parentFamilyCode,
  SCHOOL_B.parentFamilyCode,
];

async function bodyText(page: Page): Promise<string> {
  return (await page.textContent("body")) ?? "";
}

function card(page: Page, schoolName: string) {
  return page.locator("main li", { hasText: schoolName }).first();
}

// ---------------------------------------------------------------------------
// 1. The door
// ---------------------------------------------------------------------------

test(`${ROUTE} is 404 to a stranger and 200 to the operator, on the same URL`, async ({ page }) => {
  await page.context().clearCookies();
  const anonymous = await page.goto(ROUTE);
  expect(anonymous?.status(), "an unauthenticated operator route must answer 404").toBe(404);
  // Not a redirect to a sign-in page either: that would name the area.
  expect(new URL(page.url()).pathname).toBe(ROUTE);
  const denied = (await bodyText(page)).toLowerCase();
  expect(denied).not.toContain("storyjar operations");
  // Not asserted here: the absence of the word "billing". The requester typed
  // the path, so learning it back tells them nothing they did not already know,
  // and Next's flight payload legitimately carries the route it refused. What
  // must not travel out is the name of the AREA, which is the line above.

  // Positive control: same URL, same fixture, the other session.
  await asOperator(page);
  const authorised = await page.goto(ROUTE);
  expect(authorised?.status()).toBe(200);
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
});

test(`a teacher session gets 404 from ${ROUTE}, and their own console still works`, async ({
  page,
}) => {
  // A school admin manages their own school's billing in /admin. That is a
  // different question from the platform's view of every school's billing, and
  // this proves the two are not the same door.
  await loginTeacher(page, SCHOOL_A.admin);
  const refused = await page.goto(ROUTE);
  expect(refused?.status(), "a teacher session must not reach the operator area").toBe(404);

  const allowed = await page.goto("/admin");
  expect(allowed?.status()).toBe(200);
});

test(`${ROUTE} is never indexed and never cached`, async ({ page }) => {
  await asOperator(page);
  const res = await page.goto(ROUTE);
  expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  expect(res?.headers()["cache-control"] ?? "").toMatch(/no-store|no-cache/);
});

// ---------------------------------------------------------------------------
// 2. What the screen says
// ---------------------------------------------------------------------------

test("the billing screen shows every school's state, and no child, class or code anywhere", async ({
  page,
}) => {
  await asOperator(page);
  await page.goto(ROUTE);
  const body = await bodyText(page);

  // Positive control first: every negative below is worthless against a page
  // that did not render.
  expect(body).toContain(SCHOOL_A.name);
  expect(body).toContain(SCHOOL_B.name);
  expect(body).toContain(SCHOOL_C.name);
  expect(body).toContain("Read-only, payment lapsed"); // Larchwood is FROZEN
  expect(body).toContain("School plan");
  expect(body).toContain("Went read-only"); // its frozen date is on the card

  for (const name of CHILD_NAMES) {
    expect(body, `a child's name reached the billing screen: ${name}`).not.toContain(name);
  }
  for (const name of CLASS_NAMES) {
    expect(body, `a class name reached the billing screen: ${name}`).not.toContain(name);
  }
  for (const code of CODES) {
    expect(body, `a credential value reached the billing screen: ${code}`).not.toContain(code);
  }
});

test("what needs attention is at the top", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);

  const names = await page.locator("main li h2").allTextContents();
  // Larchwood is FROZEN and St Bede's is on trial, so the lapsed account sorts
  // above the healthy one however the schools were created.
  expect(names.indexOf(SCHOOL_C.name)).toBeGreaterThanOrEqual(0);
  expect(names.indexOf(SCHOOL_A.name)).toBeGreaterThanOrEqual(0);
  expect(
    names.indexOf(SCHOOL_C.name),
    "a lapsed account must sort above one that is fine",
  ).toBeLessThan(names.indexOf(SCHOOL_A.name));
});

test("an exact headcount above the suppression threshold, and none below it", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);

  // The same one constant the schools list uses (ruling R10: one suppression
  // constant, in one place). This screen does not define a second and does not
  // work a band out for itself.
  expect(MIN_CELL).toBe(10);
  await expect(card(page, SCHOOL_A.name)).toContainText("12 pupils on roll (count only, no names)");
  await expect(card(page, SCHOOL_A.name)).toContainText("Up to 105 pupils");
  await expect(card(page, SCHOOL_A.name)).toContainText("£199 a year");

  // Same rule, same render, the other direction.
  await expect(card(page, SCHOOL_B.name)).toContainText(`Fewer than ${MIN_CELL} pupils on roll`);
  await expect(card(page, SCHOOL_B.name)).not.toContainText("3 pupils");
});

// ---------------------------------------------------------------------------
// 3. The link out
// ---------------------------------------------------------------------------

test("a school with a Stripe record gets a link to it, and one without is told so", async ({
  page,
}) => {
  await asOperator(page);
  await page.goto(ROUTE);

  const larchwood = card(page, SCHOOL_C.name);
  const links = larchwood.locator("a[href]");
  await expect(links, WARM_SERVER_HINT).toHaveCount(2);

  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  expect(hrefs).toContain(customerLink(BATTERY_MODE, SCHOOL_C.stripeCustomerId));
  expect(hrefs).toContain(subscriptionLink(BATTERY_MODE, SCHOOL_C.stripeSubscriptionId));
  // The id is on screen, not only in the href: a link whose destination is
  // hidden is one the operator has to take on trust, and the id is what they
  // would read out to reconcile against Stripe.
  await expect(larchwood).toContainText(SCHOOL_C.stripeCustomerId);

  // Negative control on the same render: St Bede's has no Stripe record, and
  // the screen says which of the two reasons that is rather than leaving a gap.
  const stBedes = card(page, SCHOOL_A.name);
  await expect(stBedes.locator("a[href]")).toHaveCount(0);
  await expect(stBedes).toContainText("Stripe holds nothing for this school yet");

  // And the page says once, in words, which Stripe these open.
  await expect(page.locator("main")).toContainText(stripeModeStatement(BATTERY_MODE));
});

test("every link on the billing screen leaves for Stripe and leaks nothing on the way", async ({
  page,
}) => {
  await asOperator(page);
  await page.goto(ROUTE);

  const links = await page.locator("main a[href]").evaluateAll((as) =>
    as.map((a) => ({
      href: a.getAttribute("href") ?? "",
      rel: a.getAttribute("rel") ?? "",
      text: (a.textContent ?? "").trim(),
    })),
  );
  expect(links.length, `there is something to check. ${WARM_SERVER_HINT}`).toBeGreaterThan(0);

  for (const link of links) {
    // Nothing on this screen navigates further into the operator area, and
    // nothing points anywhere but Stripe's dashboard.
    expect(link.href.startsWith(`${STRIPE_DASHBOARD_ORIGIN}/`), `unexpected link: ${link.href}`).toBe(
      true,
    );
    // Without noreferrer the browser hands Stripe the URL of an area that
    // answers 404 to everybody else and is named nowhere public.
    expect(link.rel, `an outbound link without noreferrer: ${link.href}`).toContain("noreferrer");
    // Read out of context by a screen reader, the link still says where it goes
    // and that it leaves StoryJar.
    expect(link.text.toLowerCase()).toContain("stripe");
    expect(link.text.toLowerCase()).toContain("leaves storyjar");
  }
});

// ---------------------------------------------------------------------------
// 4. D6: read-only, and structurally so
// ---------------------------------------------------------------------------

test("there is no way to record a payment, and the screen says so", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);

  // Positive control: the page rendered and has real billing content on it.
  await expect(page.getByRole("heading", { name: /^billing$/i })).toBeVisible();
  await expect(page.locator("main")).toContainText("Read-only, payment lapsed");

  // Nothing to submit and nothing to press. The sign-out control lives in the
  // bar, outside main, so this is not accidentally asserting an empty page.
  await expect(page.locator("main form")).toHaveCount(0);
  await expect(page.locator("main button")).toHaveCount(0);
  await expect(page.locator("main input, main select, main textarea")).toHaveCount(0);

  // And the absence is stated rather than left to be discovered, because an
  // operator who cannot find the button assumes they have missed it.
  await expect(page.locator("main")).toContainText("Nothing here can be changed.");
  await expect(page.locator("main")).toContainText("no way to record a payment");
});

// ---------------------------------------------------------------------------
// 5. The URL builder itself
// ---------------------------------------------------------------------------
// Asserted directly rather than through the screen, because the mode segment is
// the detail brief 03 warns about ("do not trust memory for where /test/ sits
// in the path") and a browser test can only ever exercise the one mode the
// server happens to be in.

test("the dashboard URL carries the mode before the page, and omits it for live", () => {
  const cus = "cus_seedlarchwood0001";
  expect(customerLink("test", cus)).toBe("https://dashboard.stripe.com/test/customers/cus_seedlarchwood0001");
  expect(customerLink("live", cus)).toBe("https://dashboard.stripe.com/customers/cus_seedlarchwood0001");

  const sub = "sub_seedlarchwood0001";
  expect(subscriptionLink("test", sub)).toBe(
    "https://dashboard.stripe.com/test/subscriptions/sub_seedlarchwood0001",
  );
  expect(subscriptionLink("live", sub)).toBe(
    "https://dashboard.stripe.com/subscriptions/sub_seedlarchwood0001",
  );

  // The two entry points are the same builder, so a page name cannot drift
  // between them.
  expect(dashboardLink("test", "customer", cus)).toBe(customerLink("test", cus));
  expect(dashboardLink("live", "subscription", sub)).toBe(subscriptionLink("live", sub));
});

test("an id that is not a Stripe id produces no link at all", () => {
  // Positive control first: a well-formed id does produce one.
  expect(isStripeId("cus_seedlarchwood0001")).toBe(true);
  expect(customerLink("test", "cus_seedlarchwood0001")).not.toBeNull();

  // Every one of these would otherwise build a link to a different page, a
  // different host or a different scheme, and the screen would render it as an
  // ordinary link.
  for (const bad of [
    "cus_1/../../settings",
    "cus_1?x=1",
    "cus 1",
    "https://example.test/cus_1",
    "javascript:alert(1)",
    "//example.test",
    "..",
    "",
  ]) {
    expect(isStripeId(bad), `treated as a Stripe id: ${bad}`).toBe(false);
    expect(customerLink("test", bad), `built a link from: ${bad}`).toBeNull();
    expect(subscriptionLink("live", bad), `built a link from: ${bad}`).toBeNull();
  }
});

test("the three states of a Stripe reference are distinguishable", () => {
  // Configured, with a record: links, and no explanation needed.
  const both = stripeRef("test", "cus_abc123", "sub_abc123");
  expect(both.links.map((l) => l.what)).toEqual(["Customer", "Subscription"]);
  expect(both.absence).toBeNull();

  // Configured, no record for this school: no links, and a reason that says it
  // is about the school rather than about the deployment.
  const none = stripeRef("test", null, null);
  expect(none.links).toEqual([]);
  expect(none.absence).toContain("Stripe holds nothing for this school");

  // Not configured here at all: a different reason, so nobody reads a local
  // deployment as a school that has never paid.
  const off = stripeRef(null, "cus_abc123", "sub_abc123");
  expect(off.links, "no key, no links, whatever ids are stored").toEqual([]);
  expect(off.absence).toContain("not set up in this environment");
  expect(stripeModeStatement(null)).toContain("not set up in this environment");

  // A customer with no subscription yet is one link, not a missing screen.
  const partial = stripeRef("live", "cus_abc123", null);
  expect(partial.links.map((l) => l.what)).toEqual(["Customer"]);
  expect(partial.links[0].href).toBe("https://dashboard.stripe.com/customers/cus_abc123");
  expect(partial.absence).toBeNull();
});
