import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, SCHOOL_C, loginTeacher, asOperator } from "../helpers";
import { MIN_CELL, maskEmail, reasonProblem, REASON_MIN } from "@/lib/ops/dto";

// ===========================================================================
// A23 - The operator read screens (PR2): schools, band, adult lookup
//
// Every negative here is paired with a positive control, and for the operator
// area the pairing axis is ROLE rather than tenant (handbook section 6 item 3):
// the same URL, the same fixture, two sessions. This area answers 404 to
// everything it dislikes, which is exactly the condition under which a route
// that has stopped existing looks like a working guard, so a 404 on its own
// proves nothing here.
//
// WHAT THE FIXTURES MAKE PROVABLE, and why three schools matter
//
//   St Bede's Primary   12 pupils   above the suppression threshold, so the
//                                   exact figure is shown
//   Oakfield Primary     3 pupils   below it, so the figure is withheld and
//                                   only the band survives
//   Larchwood Primary    3 pupils   below it as well, and FROZEN, so the
//                                   billing state has something to say
//
// The suppression rule is therefore asserted in both directions on the same
// screen in the same render, which is the only way to know the threshold is
// doing the work rather than the number simply being missing.
//
// HOW THIS SPEC SIGNS IN: as a person does, with the password and a real TOTP
// code computed from the seeded secret. There is no bypass (ruling R6).
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

const PARENT_A = "demo-parent@storyjar.co.uk";
const PARENT_A_NAME = "Priya Shah";
const TEACHER_A_NAME = "Sam Rivera";
// Deliberately not "nobody@storyjar.test": the PR1 audit spec asserts that
// address never appears in the audit trail, and a lookup here writes the search
// term into it by design.
const NO_SUCH_ADULT = "no-such-adult@storyjar.test";

const GOOD_REASON = "School office called about a bounced sign-in link.";

// Every child's first name in the fixtures, plus every class name and class
// code. None of these may appear on an operator screen.
const CHILD_NAMES = [
  "Amara",
  "Ben",
  "Chloe",
  "Dev",
  "Ella",
  "Finn",
  "Grace",
  "Harry",
  "Isla",
  "Ava",
  "Theo",
  "Mia",
  "Zara",
  "Yusuf",
  "Willow",
  "Pip",
  "Robin",
  "Sage",
];
const CLASS_NAMES = ["Sunflower", "Ladybird", "Acorns", "Butterflies", "Acorn Class", "Willow Class"];
const CODES = [SCHOOL_A.classCode, SCHOOL_B.classCode, SCHOOL_C.classCode, SCHOOL_A.parentFamilyCode, SCHOOL_B.parentFamilyCode];

async function bodyText(page: Page): Promise<string> {
  return (await page.textContent("body")) ?? "";
}

async function submitLookup(
  page: Page,
  kind: "TEACHER" | "PARENT",
  email: string,
  reason: string,
) {
  await page.goto("/ops/lookup");
  await page.check(`#kind-${kind}`);
  await page.fill("#email", email);
  await page.fill("#reason", reason);
  await page.getByRole("button", { name: /search and record the reason/i }).click();
}

async function lookupRowCount(): Promise<number> {
  return db.opsAuditLog.count({ where: { action: "OPS_ADULT_LOOKUP" } });
}

// ---------------------------------------------------------------------------
// 1. The door, on the new routes
// ---------------------------------------------------------------------------

for (const route of ["/ops/schools", "/ops/lookup"]) {
  test(`${route} is 404 to a stranger and 200 to the operator, on the same URL`, async ({ page }) => {
    await page.context().clearCookies();
    const anonymous = await page.goto(route);
    expect(anonymous?.status(), "an unauthenticated operator route must answer 404").toBe(404);
    // Not a redirect to a sign-in page either: that would name the area.
    expect(new URL(page.url()).pathname).toBe(route);
    const denied = (await bodyText(page)).toLowerCase();
    expect(denied).not.toContain("storyjar operations");

    // Positive control: same URL, same fixture, the other session.
    await asOperator(page);
    const authorised = await page.goto(route);
    expect(authorised?.status()).toBe(200);
    await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  });

  test(`a teacher session gets 404 from ${route}, and their own console still works`, async ({
    page,
  }) => {
    await loginTeacher(page, SCHOOL_A.admin);
    const refused = await page.goto(route);
    expect(refused?.status(), "a teacher session must not reach the operator area").toBe(404);

    // Positive control on the same cookie: it is a working session, just not
    // this one.
    const allowed = await page.goto("/admin");
    expect(allowed?.status()).toBe(200);
  });

  test(`${route} is never indexed and never cached`, async ({ page }) => {
    await asOperator(page);
    const res = await page.goto(route);
    expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
    expect(res?.headers()["cache-control"] ?? "").toMatch(/no-store|no-cache/);
  });
}

// ---------------------------------------------------------------------------
// 2. The schools list
// ---------------------------------------------------------------------------

test("the schools list shows schools and billing, and no child, class or code anywhere", async ({
  page,
}) => {
  await asOperator(page);
  await page.goto("/ops/schools");
  const body = await bodyText(page);

  // Positive control first: the page rendered and has real content on it. Every
  // negative below is worthless against an empty page.
  expect(body).toContain(SCHOOL_A.name);
  expect(body).toContain(SCHOOL_B.name);
  expect(body).toContain(SCHOOL_C.name);
  expect(body).toContain("Read-only, payment lapsed"); // Larchwood is FROZEN

  for (const name of CHILD_NAMES) {
    expect(body, `a child's name reached the schools list: ${name}`).not.toContain(name);
  }
  for (const name of CLASS_NAMES) {
    expect(body, `a class name reached the schools list: ${name}`).not.toContain(name);
  }
  for (const code of CODES) {
    expect(body, `a credential value reached the schools list: ${code}`).not.toContain(code);
  }
  // And nothing to click through into. A number in this area is a number, not a
  // way in.
  const hrefs = await page.locator("main a[href]").evaluateAll((as) =>
    as.map((a) => a.getAttribute("href") ?? ""),
  );
  expect(hrefs, "the schools list must not link anywhere").toEqual([]);
});

test("an exact headcount above the suppression threshold, and none below it", async ({ page }) => {
  await asOperator(page);
  await page.goto("/ops/schools");

  const stBedes = page.locator("li", { hasText: SCHOOL_A.name }).first();
  const oakfield = page.locator("li", { hasText: SCHOOL_B.name }).first();

  // St Bede's has 12 pupils on roll, at or above MIN_CELL, so the figure is
  // shown and is labelled as a count.
  expect(MIN_CELL).toBe(10);
  await expect(stBedes).toContainText("12 pupils on roll (count only, no names)");

  // Oakfield has 3, below the threshold, so the number is withheld. This is the
  // same rule on the same screen in the same render, which is what makes the
  // assertion above mean something.
  await expect(oakfield).toContainText(`Fewer than ${MIN_CELL} pupils on roll`);
  await expect(oakfield).not.toContainText("3 pupils");
});

test("the price band is rendered from the server's own figures", async ({ page }) => {
  await asOperator(page);
  await page.goto("/ops/schools");
  const stBedes = page.locator("li", { hasText: SCHOOL_A.name }).first();
  // 12 pupils falls in the smallest band, and the band carries its price so the
  // screen never works one out for itself.
  await expect(stBedes).toContainText("Up to 105 pupils");
  await expect(stBedes).toContainText("£199 a year");
});

// ---------------------------------------------------------------------------
// 3. Exact-match adult lookup
// ---------------------------------------------------------------------------

test("a parent is found only by their whole address, and comes back masked", async ({ page }) => {
  await asOperator(page);

  // Negative: a prefix of a real address finds nothing. There is no substring
  // match, so an address the operator does not already hold is unreachable.
  // The prefix is still a well-formed address, because the field is type=email
  // and the browser refuses to submit anything that is not one: a test that
  // typed "demo-parent" would prove the browser works rather than the server.
  await submitLookup(page, "PARENT", "demo-parent@storyjar.co", GOOD_REASON);
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
  // The refusal NAMES THE TABLE it searched, and this is stronger than the
  // sentence it replaced. "No account has that address" was a claim about every
  // account in StoryJar, made by a screen that had looked in one table — false
  // in the commonest way this form is used wrong, since it defaults to staff and
  // the commonest support call is about a parent (F61).
  await expect(page.locator("main")).toContainText("No parent or carer has that address");
  await expect(
    page.locator("main"),
    "the refusal must not claim more than the search it performed",
  ).not.toContainText("No account has that address");

  // Positive control on the same record: the whole address finds it.
  await submitLookup(page, "PARENT", PARENT_A, GOOD_REASON);
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
  const result = page.locator("section[aria-labelledby='ops-lookup-result']");
  await expect(result).toContainText(maskEmail(PARENT_A));

  // The record never carries the address in full. The only place it appears on
  // this page is the box the operator typed it into, which is asserted rather
  // than hidden: masking is about what the record hands over, and pretending
  // otherwise while the input sits above it would be theatre.
  const resultText = (await result.textContent()) ?? "";
  expect(resultText, "the record must not carry the address in full").not.toContain(PARENT_A);
  expect(await page.inputValue("#email")).toBe(PARENT_A);
});

test("the mask keeps at most two characters, in the shape the amendment asks for", () => {
  expect(maskEmail("mark@me.com")).toBe("ma***@me.com");
  expect(maskEmail("ab@me.com"), "a two-letter local part does not survive intact").toBe(
    "a***@me.com",
  );
  expect(maskEmail("a@me.com")).toBe("a***@me.com");
  expect(maskEmail("not-an-address")).toBe("***");
  expect(maskEmail("@me.com")).toBe("***");
});

test("a parent record carries no name and no link to a child, in either direction", async ({
  page,
}) => {
  await asOperator(page);
  await submitLookup(page, "PARENT", PARENT_A, GOOD_REASON);
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
  const body = await bodyText(page);

  expect(body, "a parent's own name is not one of the three fields R11 permits").not.toContain(
    PARENT_A_NAME,
  );
  for (const name of CHILD_NAMES) {
    expect(body, `a child's name reached the parent record: ${name}`).not.toContain(name);
  }
  expect(body).not.toContain(SCHOOL_A.parentFamilyCode);
  // Not even a count. The owner was asked directly and chose to keep it refused.
  expect(body).not.toMatch(/\b\d+\s+(children|child|pupils)\b/i);
  expect(body).toContain("or how many");
});

test("a teacher lookup returns the adult record in full", async ({ page }) => {
  await asOperator(page);
  await submitLookup(page, "TEACHER", SCHOOL_A.admin.email, GOOD_REASON);
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
  const body = await bodyText(page);

  // The positive control for the masking test above: masking is a property of a
  // parent record, not of the screen, and a member of staff is an adult
  // professional whose work address the operator may read.
  expect(body).toContain(SCHOOL_A.admin.email);
  expect(body).toContain(TEACHER_A_NAME);
  expect(body).toContain(SCHOOL_A.name);
  expect(body).toContain("Admin at this school");
  // Their password hash is not a field this can reach.
  const row = await db.teacher.findUnique({ where: { email: SCHOOL_A.admin.email } });
  expect(await page.content()).not.toContain(row!.passwordHash);
});

// ---------------------------------------------------------------------------
// 4. The reason field (ruling R16) and the audit trail (ruling R11)
// ---------------------------------------------------------------------------

test("the server refuses a short reason, and nothing is looked up or recorded", async ({ page }) => {
  await asOperator(page);
  const before = await lookupRowCount();

  await submitLookup(page, "TEACHER", SCHOOL_A.admin.email, "too short");
  await expect(page.locator("#ops-lookup-error")).toContainText(`At least ${REASON_MIN} characters`);
  await expect(page.locator("#reason")).toHaveAttribute("aria-invalid", "true");
  // No result section at all, so the refusal is not cosmetic.
  await expect(page.getByRole("heading", { name: /^result$/i })).toHaveCount(0);
  expect(await lookupRowCount(), "a refused submission must not be audited").toBe(before);

  // Positive control: the same submission with an acceptable reason goes
  // through, so the refusal was caused by the reason and not by a broken form.
  await submitLookup(page, "TEACHER", SCHOOL_A.admin.email, GOOD_REASON);
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();
  expect(await lookupRowCount()).toBe(before + 1);
});

test("the same rule holds in the module the server validates with", () => {
  // The screen and the server share one implementation, so the boundary cases
  // are asserted here rather than by typing into a form eleven times.
  expect(reasonProblem("")).toMatch(/say why/i);
  expect(reasonProblem("           ")).toMatch(/say why/i);
  expect(reasonProblem("a".repeat(REASON_MIN - 1))).toMatch(new RegExp(`${REASON_MIN} characters`));
  expect(reasonProblem(`  ${"a".repeat(REASON_MIN - 1)}  `), "trimmed before counting").toMatch(
    new RegExp(`${REASON_MIN} characters`),
  );
  expect(reasonProblem("a".repeat(REASON_MIN))).toBeNull();
  expect(reasonProblem("a".repeat(1000))).toBeNull();
  expect(reasonProblem("a".repeat(1001))).toMatch(/too long/i);
});

test("a completed lookup is audited with the search term and the reason, word for word", async ({
  page,
}) => {
  await asOperator(page);
  const reason = `Checking a bounced letter for the office, ${Date.now()}`;
  await submitLookup(page, "PARENT", PARENT_A, reason);
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();

  const row = await db.opsAuditLog.findFirst({
    where: { action: "OPS_ADULT_LOOKUP", reason },
    orderBy: { at: "desc" },
  });
  expect(row, "every lookup is audited with the term and the reason (ruling R11)").not.toBeNull();
  expect(row!.reason, "stored verbatim").toBe(reason);
  expect(row!.detail, "the search term is in the row").toContain(PARENT_A);
  expect(row!.subjectType).toBe("PARENT");
  expect(row!.actorName).toBe("ops@storyjar.test");

  // A lookup that found nothing is recorded too: the operator still learned
  // something about that address.
  const missReason = `Checking an address the office read out, ${Date.now()}`;
  await submitLookup(page, "PARENT", NO_SUCH_ADULT, missReason);
  await expect(page.locator("main")).toContainText("No parent or carer has that address");
  const miss = await db.opsAuditLog.findFirst({ where: { reason: missReason } });
  expect(miss).not.toBeNull();
  expect(miss!.detail).toContain("no record");
  expect(miss!.subjectId).toBeNull();
});

test("no credential value reaches either screen or the audit trail", async ({ page }) => {
  await asOperator(page);
  await submitLookup(page, "PARENT", PARENT_A, GOOD_REASON);
  await expect(page.getByRole("heading", { name: /^result$/i })).toBeVisible();

  const rows = await db.opsAuditLog.findMany({ where: { action: "OPS_ADULT_LOOKUP" } });
  expect(rows.length, "there is something to check").toBeGreaterThan(0);
  const blob = JSON.stringify(rows);
  for (const code of CODES) {
    expect(blob, `a credential value reached the audit trail: ${code}`).not.toContain(code);
  }
  for (const name of CHILD_NAMES) {
    expect(blob, `a child's name reached the audit trail: ${name}`).not.toContain(name);
  }
});
