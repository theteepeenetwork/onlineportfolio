import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SCHOOL_A, loginTeacher, signInOperator } from "../helpers";
import { BATTERY_MAIL_HMAC_KEY } from "../mailHmacFixtureKey";
import { recordMailAttempt } from "@/lib/mailCounters";
import {
  MAIL_VERDICT_LABEL,
  classifyMailResult,
  mailVerdict,
  utcDay,
} from "@/lib/mailStatus";
import { mailAddressHmac, mailHmacConfigured } from "@/lib/ops/mailHmac";

// ===========================================================================
// A29 - Mail delivery status (PR5): counters that cannot name anybody
//
// Handbook ruling R9 fixes the storage model as "counters and HMAC-keyed
// suppression, and explicitly NO recipient address or domain stored", and owner
// decision D7, which would permit per-recipient failure detail, is unanswered
// with a published default of counters only. So the interesting assertions here
// are mostly about ABSENCE, and absence is exactly what a passing test proves
// least well: a screen that failed to render contains no email address either.
//
// Every negative below is therefore paired with a positive control on the same
// resource, and for the operator area the pairing axis is ROLE rather than
// tenant (handbook section 6 item 3): the same URL, the same fixture, two
// sessions.
//
// THE TRAP THIS SPEC EXISTS TO KEEP SHUT
//
// Brief 04 named it and it is the important one. FINDINGS F6 makes
// requestMagicLink answer identically for an address on file and one that is
// not, so the public sign-in form cannot be used to discover who has an
// account. A visible list of sign-in failures BY ADDRESS, inside the operator
// area, rebuilds that same signal internally with a timestamp attached. The
// defence is not that nobody would build the screen; it is that the data to
// build it from does not exist. Hence the row-shape assertions below, which
// check the columns rather than the page.
//
// WHAT THE FIXTURES MAKE PROVABLE (prisma/seed-test.ts)
//
//   Today          12 accepted, nothing failed        -> a calm sentence
//   Last 7 days    23 attempted, 7 of them not sent   -> "Needs attention"
//   20 days ago    99 failures, outside both windows  -> proves the filter
//   Oakfield's parent      BOUNCE     -> an adult record that says so
//   St Bede's demo parent  no row     -> one that says the opposite
//
// HOW THIS SPEC SIGNS IN: as a person does, with the password and a real TOTP
// code computed from the seeded secret. There is no bypass (ruling R6).
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

const ROUTE = "/ops/mail";

const PARENT_SUPPRESSED = "demo-parent-oakfield@storyjar.co.uk";
const PARENT_CLEAR = "demo-parent@storyjar.co.uk";
const GOOD_REASON = "School office says this parent gets no sign-in link.";

// Every address and domain in the fixtures. None may appear on the mail screen,
// and none may appear in any row of the three new tables.
const FIXTURE_ADDRESSES = [
  PARENT_SUPPRESSED,
  PARENT_CLEAR,
  "teacher@school.uk",
  "admin@oakfield.sch.uk",
  "teacher@oakfield.sch.uk",
  "teacher@larchwood.sch.uk",
  "someone-who-left@storyjar.test",
];
const FIXTURE_DOMAINS = ["storyjar.co.uk", "oakfield.sch.uk", "larchwood.sch.uk", "school.uk"];

async function bodyText(page: Page): Promise<string> {
  return (await page.textContent("body")) ?? "";
}

async function submitLookup(page: Page, email: string) {
  await page.goto("/ops/lookup");
  await page.check("#kind-PARENT");
  await page.fill("#email", email);
  await page.fill("#reason", GOOD_REASON);
  await page.getByRole("button", { name: /search and record the reason/i }).click();
}

// ---------------------------------------------------------------------------
// 1. The door
// ---------------------------------------------------------------------------

test(`${ROUTE} is 404 to a stranger and 200 to the operator, on the same URL`, async ({ page }) => {
  await page.context().clearCookies();
  const anonymous = await page.goto(ROUTE);
  expect(anonymous?.status(), "an unauthenticated operator route must answer 404").toBe(404);
  // Not a redirect to a sign-in page either: that would name the area (R17).
  expect(new URL(page.url()).pathname).toBe(ROUTE);
  expect((await bodyText(page)).toLowerCase()).not.toContain("storyjar operations");

  // Positive control: same URL, same fixture, the other session.
  await signInOperator(page);
  const authorised = await page.goto(ROUTE);
  expect(authorised?.status()).toBe(200);
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
  expect(authorised?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
});

test(`a teacher session gets 404 from ${ROUTE}, and their own console still works`, async ({
  page,
}) => {
  await loginTeacher(page, SCHOOL_A.admin);
  const refused = await page.goto(ROUTE);
  expect(refused?.status(), "a school admin is not a platform operator").toBe(404);

  // Positive control: the same session, on the console it is entitled to.
  const allowed = await page.goto("/admin");
  expect(allowed?.status()).toBe(200);
});

test(`${ROUTE} is never indexed, and is declared uncacheable`, () => {
  // Cache-Control is asserted against the CONFIGURATION rather than the
  // response, and the difference is worth stating rather than hiding. Next's
  // dev server answers a dynamic route with "no-cache, must-revalidate" of its
  // own, which overrides the configured header, so a response assertion here
  // would either fail on a correct build or be written loosely enough to pass
  // on an incorrect one. What can be proved from here is that the rule covers
  // this path, and it does: the config matches "/ops/:path*", not a list of
  // routes somebody has to remember to extend.
  const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  expect(config).toContain('"/ops/:path*"');
  expect(config).toContain('value: "private, no-store"');
});

test("no public route advertises the mail screen (ruling R18)", async ({ page }) => {
  await page.context().clearCookies();

  // There is deliberately no robots.txt in this project, and the reason is in
  // next.config.ts: naming /ops in one would publish the path it is meant to
  // keep quiet. Asserted so that adding one becomes a decision rather than an
  // accident.
  expect((await page.goto("/robots.txt"))?.status()).toBe(404);

  // And the public landing page links nowhere near it.
  const landing = await page.goto("/");
  expect(landing?.status()).toBe(200);
  const html = (await landing?.text()) ?? "";
  // Positive control: the page really is the landing page.
  expect(html).toContain("StoryJar");
  expect(html, "no public surface may mention the operator area").not.toContain("/ops");
});

// ---------------------------------------------------------------------------
// 2. What the screen may and may not say
// ---------------------------------------------------------------------------
//
// ONE SIGN-IN FOR THE WHOLE BLOCK, and it is not a shortcut.
//
// The operator door has no bypass (ruling R6): a test signs in with the
// password and a real TOTP code, and replay protection refuses a step at or
// below the last one accepted, so two sign-ins inside one 30-second window are
// impossible and the second has to wait for the clock. A file that signed in
// per test spent most of its runtime asleep and, at eight sign-ins, started
// exceeding the per-test timeout for a reason that had nothing to do with what
// it was testing.
//
// So these tests share one signed-in context and run in order. Nothing is
// weakened by it: every test below is a read of the same page, none of them
// mutates anything, and the ROLE pairing the handbook asks for lives in the
// door tests above, where the two sessions are the point.

test.describe("the mail screen, seen by an operator", () => {
  test.describe.configure({ mode: "serial" });

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await signInOperator(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

test("the mail screen shows the figures, and no address or domain anywhere", async () => {
    await page.goto(ROUTE);
  const main = page.locator("main");

  // Positive control first: the screen rendered its actual numbers, so the
  // absences below are absences from a page that exists.
  await expect(main).toContainText("Today");
  await expect(main).toContainText("The last 7 days");
  await expect(main).toContainText("Parent sign-in link");

  const text = await bodyText(page);
  for (const address of FIXTURE_ADDRESSES) {
    expect(text, `${address} must never appear on the mail screen`).not.toContain(address);
  }
  for (const domain of FIXTURE_DOMAINS) {
    expect(text, `the domain ${domain} is as identifying as the address here`).not.toContain(domain);
  }
  // Nothing shaped like an address at all, which also catches one nobody
  // thought to list. Scoped to main rather than the whole document because
  // textContent on <body> also concatenates the inline script Next uses to
  // ship the flight payload, and asserting over compiled output tests the
  // framework rather than this screen.
  expect((await page.locator("main").textContent()) ?? "").not.toMatch(
    /[\w.+-]+@[\w-]+\.[\w.-]+/,
  );
});

test("the window filter is a filter, not a total of the table", async () => {
    await page.goto(ROUTE);
    const main = page.locator("main");

    // The expected figures are COMPUTED from the table rather than written in,
    // and the reason is a defect this test had on its first full run. The
    // fixtures seed 12 attempts today and 23 in the week, but ops-mail is not
    // the only spec in this project: f19 and the family specs request magic
    // links, every one of those is a genuine send attempt, and every attempt is
    // counted. So the hard-coded 12 became 13 the moment the file ran after
    // them, and the test failed for being wrong about the world rather than the
    // screen being wrong about the data.
    //
    // Computing it here keeps the assertion strong and makes it order
    // independent: it still proves the screen agrees with the stored rows AND
    // that it applies the window, because the 99-failure row seeded twenty days
    // back is in the table and must not be in either figure.
    const rows = await db.mailCounter.findMany();
    const today = utcDay(new Date());
    const weekAgo = utcDay(new Date(Date.now() - 6 * 86400000));
    const total = (pick: (r: (typeof rows)[number]) => boolean) =>
      rows.filter(pick).reduce((sum, r) => sum + r.count, 0);

    const attemptedToday = total((r) => r.day === today);
    const attemptedWeek = total((r) => r.day >= weekAgo && r.day <= today);
    const attemptedEver = total(() => true);

    // Positive control, on the same resource: there IS something outside the
    // window, so "the screen shows the in-window figure" is a statement about
    // filtering rather than about an empty table.
    expect(
      attemptedEver,
      "nothing is seeded outside the window, so this proves no filtering",
    ).toBeGreaterThan(attemptedWeek);
    expect(rows.some((row) => row.count === 99), "the out-of-window fixture is missing").toBe(true);

    // Read as raw textContent rather than through toContainText, because the
    // term and its figure are a <dt>/<dd> pair and only the raw concatenation
    // puts them next to each other.
    const rendered = (await main.textContent()) ?? "";
    expect(rendered, "today's attempts").toContain(`Attempted${attemptedToday}`);
    expect(rendered, "the seven-day attempts").toContain(`Attempted${attemptedWeek}`);
    expect(rendered, "an out-of-window row must not be counted").not.toContain(
      `Attempted${attemptedEver}`,
    );
  });

  test("a delivery state is words, never colour alone", async () => {
    await page.goto(ROUTE);
    const main = page.locator("main");

    // Every window states its verdict as a sentence from the closed list in
    // src/lib/mailStatus.ts. Which sentence depends on what has been sent, which
    // depends on what else has run, so the assertion is that each window card
    // carries EXACTLY ONE of them: a card with none is a figure with no verdict,
    // and a card with two is a component that cannot make its mind up.
    const cards = main.locator("ul > li.card");
    await expect(cards).toHaveCount(2);
    const sentences = Object.values(MAIL_VERDICT_LABEL);
    for (let i = 0; i < 2; i += 1) {
      const text = (await cards.nth(i).textContent()) ?? "";
      const found = sentences.filter((sentence) => text.includes(sentence));
      expect(found, `window ${i} must state exactly one verdict in words`).toHaveLength(1);
    }

    // The seeded week is failing badly enough that its verdict is the loud one,
    // and it stays that way however many successful sends other specs add: the
    // margin is checked here rather than assumed, so this fails loudly if the
    // fixtures are ever watered down.
    const rows = await db.mailCounter.findMany();
    const weekAgo = utcDay(new Date(Date.now() - 6 * 86400000));
    const inWeek = rows.filter((r) => r.day >= weekAgo);
    const attempted = inWeek.reduce((sum, r) => sum + r.count, 0);
    const failed = inWeek
      .filter((r) => r.outcome !== "SENT")
      .reduce((sum, r) => sum + r.count, 0);
    expect(mailVerdict(attempted, failed)).toBe("NEEDS_ATTENTION");
    await expect(main).toContainText(MAIL_VERDICT_LABEL.NEEDS_ATTENTION);

    // And the honest limit of what "accepted" means is on the page, not implied.
    await expect(main).toContainText("It is not a delivery receipt");
  });

  test("there is no search box, no export and no control of any kind", async () => {
    await page.goto(ROUTE);
  const main = page.locator("main");

  // Positive control: the page rendered.
  await expect(main).toContainText("Addresses Mailjet is refusing");

  // Handbook section 6 item 10: no export, no CSV, no download, no generic
  // search endpoint. A "check this address" box would be the enumeration
  // oracle brief 05 forbids by name.
  await expect(main.locator("input, textarea, select, button")).toHaveCount(0);
  await expect(main.locator("a[download], a[href$='.csv']")).toHaveCount(0);
  await expect(main.locator("[disabled], [aria-disabled='true']")).toHaveCount(0);
  await expect(main).toContainText("Nothing here can be changed.");
});

test("no media element reaches the mail screen (section 6 item 9)", async () => {
    await page.goto(ROUTE);
  await expect(page.locator("main")).toContainText("Mail");
  await expect(
    page.locator("main img, main video, main audio, main picture, main source, main iframe, main object, main embed"),
  ).toHaveCount(0);
});
});

// ---------------------------------------------------------------------------
// 3. The rows themselves. This is the half a screen test cannot reach.
// ---------------------------------------------------------------------------

test("a counter row has five columns and none of them can hold a person", async () => {
  const rows = await db.mailCounter.findMany();
  // Positive control: there are rows, so the shape assertion is about
  // something.
  expect(rows.length, "the mail counter fixtures are missing").toBeGreaterThan(0);

  const allowed = ["day", "templateKey", "outcome", "statusClass", "count"].sort();
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(allowed);
    const serialised = JSON.stringify(row);
    expect(serialised, "no counter row may contain an address").not.toMatch(/@/);
    for (const domain of FIXTURE_DOMAINS) {
      expect(serialised).not.toContain(domain);
    }
  }
});

test("a suppression row holds a KEYED label, never the address and never a plain digest", async () => {
  const rows = await db.mailSuppression.findMany();
  expect(rows.length, "the suppression fixtures are missing").toBeGreaterThan(0);

  const allowed = ["id", "addressHmac", "state", "firstSeenAt", "lastSeenAt"].sort();
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(allowed);
    const serialised = JSON.stringify(row);
    expect(serialised).not.toMatch(/@/);
    for (const address of FIXTURE_ADDRESSES) {
      expect(serialised).not.toContain(address);
    }
  }

  // The label for a known address matches, which is the positive control: the
  // hashing the application does and the hashing the fixtures did agree.
  const label = mailAddressHmac(PARENT_SUPPRESSED, { MAIL_HMAC_KEY: BATTERY_MAIL_HMAC_KEY });
  expect(label, "no key means no label").not.toBeNull();
  expect(rows.some((row) => row.addressHmac === label)).toBe(true);

  // And the negative: it is NOT the unkeyed SHA-256 of the address, which is
  // reversible with a dictionary in under a second and is not a
  // de-identification measure (brief 05).
  const plain = createHash("sha256").update(PARENT_SUPPRESSED).digest("hex");
  expect(rows.some((row) => row.addressHmac === plain)).toBe(false);
  expect(label).not.toBe(plain);
});

test("changing the key changes the label, which is what makes the key do anything", () => {
  const withKey = mailAddressHmac(PARENT_SUPPRESSED, { MAIL_HMAC_KEY: BATTERY_MAIL_HMAC_KEY });
  const withOther = mailAddressHmac(PARENT_SUPPRESSED, { MAIL_HMAC_KEY: "a-different-key" });
  expect(withKey).not.toBe(withOther);
  // Case and surrounding space are normalised, or one mailbox becomes two rows.
  expect(mailAddressHmac(`  ${PARENT_SUPPRESSED.toUpperCase()} `, { MAIL_HMAC_KEY: BATTERY_MAIL_HMAC_KEY })).toBe(
    withKey,
  );
  // With no key there is no label at all, and no silent fallback to a default
  // key, which would produce rows that look protected and are not.
  expect(mailAddressHmac(PARENT_SUPPRESSED, {})).toBeNull();
  expect(mailHmacConfigured({})).toBe(false);
});

test("a job run records an outcome and a count, and nothing about a message", async () => {
  const runs = await db.jobRun.findMany();
  expect(runs.length, "the job-run fixture is missing").toBeGreaterThan(0);
  for (const run of runs) {
    const serialised = JSON.stringify(run);
    expect(serialised).not.toMatch(/@/);
    // `note` is a fixed vocabulary. Nothing user-supplied, nothing from the
    // provider, no path and no filename.
    expect(run.outcomeDetail ?? "").toMatch(/^[\w ]*$/);
  }
});

// ---------------------------------------------------------------------------
// 4. The recorder inside the mailer
// ---------------------------------------------------------------------------

test("every send result maps onto a closed vocabulary, and the provider's words never survive", () => {
  expect(classifyMailResult({ ok: true })).toEqual({ outcome: "SENT", statusClass: "" });
  expect(classifyMailResult({ ok: false, reason: "not-configured" })).toEqual({
    outcome: "UNCONFIGURED",
    statusClass: "",
  });
  expect(classifyMailResult({ ok: false, reason: "http-429" })).toEqual({
    outcome: "FAILED",
    statusClass: "4xx",
  });
  expect(classifyMailResult({ ok: false, reason: "http-503" })).toEqual({
    outcome: "FAILED",
    statusClass: "5xx",
  });
  expect(classifyMailResult({ ok: false, reason: "timeout" })).toEqual({
    outcome: "FAILED",
    statusClass: "timeout",
  });

  // The one that matters. Mailjet builds this reason out of its own response,
  // so a provider that starts naming the recipient in a rejection would hand it
  // straight to the database if any of it were stored.
  const nasty = classifyMailResult({
    ok: false,
    reason: "rejected-invalid recipient ada@example.com",
  });
  expect(nasty.outcome).toBe("FAILED");
  expect(nasty.statusClass).toBe("rejected");
  expect(JSON.stringify(nasty)).not.toContain("@");

  // And an outcome nobody has seen before is still recorded, as "other".
  expect(classifyMailResult({ ok: false, reason: "something new" })).toEqual({
    outcome: "FAILED",
    statusClass: "other",
  });
});

test("recording an attempt writes one counter row, increments it, and never throws", async () => {
  const day = utcDay(new Date());
  const where = {
    day_templateKey_outcome_statusClass: {
      day,
      templateKey: "magic-link",
      outcome: "FAILED",
      statusClass: "5xx",
    },
  };
  const before = (await db.mailCounter.findUnique({ where }))?.count ?? 0;

  await recordMailAttempt("magic-link", { ok: false, reason: "http-500" });
  const once = await db.mailCounter.findUnique({ where });
  expect(once?.count).toBe(before + 1);

  // Twice is an increment, not a second row: statusClass is an empty string
  // rather than NULL for exactly this reason, since SQLite treats NULLs as
  // distinct in a unique constraint.
  await recordMailAttempt("magic-link", { ok: false, reason: "http-500" });
  expect((await db.mailCounter.findUnique({ where }))?.count).toBe(before + 2);

  // It must never throw, whatever it is handed, because it runs inside sendMail
  // and a counter that cannot be written must not become a parent who cannot
  // sign in.
  await expect(
    recordMailAttempt("magic-link", { ok: false, reason: "  not a reason" }),
  ).resolves.toBeUndefined();

  // Put the fixtures back. Not tidiness: the screen tests above assert exact
  // totals, and a row left behind here would make them depend on whether this
  // test had already run, which is the kind of failure that gets blamed on the
  // code. Both rows this test can create are removed, including the "other"
  // one from the unrecognised reason.
  if (before === 0) {
    await db.mailCounter.delete({ where });
  } else {
    await db.mailCounter.update({ where, data: { count: before } });
  }
  await db.mailCounter.deleteMany({
    where: { day, templateKey: "magic-link", outcome: "FAILED", statusClass: "other" },
  });
});

test("sendMail has exactly one way out, and it counts", () => {
  const source = readFileSync(path.join(process.cwd(), "src", "lib", "mailer.ts"), "utf8");

  // Positive control: this really is the file that sends mail.
  expect(source).toContain("https://api.mailjet.com/v3.1/send");

  // Every exit goes through finish(), which records. A new failure branch
  // therefore cannot be added without counting it, and the assertion is about
  // the shape rather than a count of call sites, so an honest refactor is not
  // a red build for no reason.
  expect(source).toContain("recordMailAttempt(templateKey, result)");
  expect(
    source.match(/return\s*\{/g),
    "sendMail must return only through finish(), or an attempt goes uncounted",
  ).toBeNull();

  // And what it is handed is a template constant, never the recipient.
  expect(source).toContain("finish(templateKey, { ok: true })");
  expect(source).not.toMatch(/recordMailAttempt\([^)]*\bto\b/);
});

// ---------------------------------------------------------------------------
// 5. The one place a person and a delivery state meet
// ---------------------------------------------------------------------------

test("an adult record says whether Mailjet is refusing that address, and it is computed here", async ({
  page,
}) => {
  // One sign-in, three lookups, for the reason set out above section 2: the
  // door has no bypass and consecutive sign-ins have to wait for the TOTP
  // clock. The three lookups are the assertion, and they belong together
  // anyway, because each is the other two's control.
  await signInOperator(page);
  const main = page.locator("main");

  await submitLookup(page, PARENT_SUPPRESSED);
  await expect(main).toContainText("Bounced");

  // The other answer, on the same screen and the same shape. Without it, a
  // component that printed "Bounced" for everybody would pass.
  await submitLookup(page, PARENT_CLEAR);
  await expect(main).toContainText("Mailjet is not refusing this address");
  await expect(main).not.toContainText("Bounced");

  // And the label itself is not a way in. Brief 05 imposes both halves of this
  // and they are the whole control: the answer is hashed server-side from the
  // stored record, and there is no free-text "is this address blocked?" box,
  // because that is an account-enumeration oracle that undoes FINDINGS F6.
  const label = mailAddressHmac(PARENT_SUPPRESSED, { MAIL_HMAC_KEY: BATTERY_MAIL_HMAC_KEY }) ?? "";
  expect(label.length).toBe(64);
  await submitLookup(page, `${label}@storyjar.test`);
  await expect(main).not.toContainText("Bounced");
});
