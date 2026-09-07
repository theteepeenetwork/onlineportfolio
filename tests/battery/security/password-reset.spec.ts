import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, SCHOOL_C, loginTeacher, clearSession } from "../helpers";
import { hashPasswordToken } from "@/lib/passwordTokenPolicy";

// ===========================================================================
// The teacher password reset, held to the six properties that make it safe to
// have at all. A reset flow is a deliberate, public, unauthenticated route to
// changing an account's password: every one of these is the difference between
// that being a recovery mechanism and being a way in.
//
// BLOCKING. Pilot teachers arrive on 1 September and this is their only route
// back into an account without the owner opening a terminal.
// ===========================================================================

const db = new PrismaClient();
const FORGOTTEN = "/login/teacher/forgotten";

/**
 * Ask for a reset the way the form does, and hand back what the page said.
 *
 * WAITS FOR A SETTLED ANSWER, not for a fixed number of milliseconds. The first
 * version slept 700ms and then read the screen, which on a loaded machine
 * captured the button still saying "Sending…" for the address that had real
 * work to do — minting a token, hashing it, queueing mail — and the finished
 * confirmation for the address that did not. It then reported the two as
 * DIFFERENT, which is the exact opposite of what this file exists to prove: a
 * neutrality test that fails when the machine is slow is a neutrality test
 * nobody will believe when it fails for real.
 *
 * The same class as FINDINGS F36, and the repo's own lesson from it: when you
 * replace a sleep with a wait, wait for the thing you actually mean. Here that
 * is "the form has answered", in any of the three ways it can.
 */
async function requestReset(page: import("@playwright/test").Page, email: string) {
  await page.goto(FORGOTTEN);
  await page.fill("#email", email);
  await page.getByRole("button", { name: /send me a link/i }).click();
  await page
    .getByText(/if that address is on our system|doesn.t look quite right|too many attempts/i)
    .waitFor({ state: "visible", timeout: 15_000 });
  return (await page.locator("main").innerText()).trim();
}

test("the answer is the same for an address on file and one that is not [F6]", async ({ page }) => {
  const known = await requestReset(page, SCHOOL_A.admin.email);
  await clearSession(page);
  const unknown = await requestReset(page, "nobody.at.all@example.invalid");

  // Only the development-only paragraph is removed before comparing. That block
  // is the ONE deliberate difference, it exists so local development needs no
  // mail server, and signInLinkMayBeShown() keeps it out of production —
  // asserted separately below. Everything a teacher reads must be identical.
  const strip = (s: string) =>
    s
      .replace(/Development only[^\n]*\n?/i, "")
      .replace(/open the link now\n?/i, "")
      .replace(/\s+/g, " ")
      .trim();
  expect(
    strip(unknown),
    "a reset form that answers differently for a known address is an enumeration oracle against a school's published staff list",
  ).toBe(strip(known));
});

test("a raw token is never stored — the database holds only a digest", async ({ page }) => {
  // A DIFFERENT fixture teacher in each test below, because the throttle is now
  // keyed per address and five requests for one address inside fifteen minutes
  // is a block — which is the behaviour the last test asserts on purpose, and
  // which must not be what the others trip over.
  await requestReset(page, SCHOOL_A.otherTeacher.email);

  const row = await db.teacherPasswordToken.findFirst({
    where: { teacher: { email: SCHOOL_A.otherTeacher.email }, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  expect(row, "no token was minted for a real address").not.toBeNull();

  // A SHA-256 hex digest, and nothing that looks like the 48-hex-character raw
  // token the URL carries. If a database read ever becomes replayable this is
  // the assertion that broke.
  expect(row!.resetHash).toMatch(/^[0-9a-f]{64}$/);
  expect(row!.purpose).toBe("RESET");
});

test("the reset link is single use, and the second attempt is refused", async ({ page, browser }) => {
  const raw = await mintFor(page, SCHOOL_B.teacher.email);

  await setPasswordWith(page, raw, "first-attempt-passphrase");
  await expect(page).toHaveURL(/\/teacher/);

  // A second browser, the same link.
  const ctx = await browser.newContext();
  const second = await ctx.newPage();
  await setPasswordWith(second, raw, "second-attempt-passphrase");
  await expect(
    second.getByText(/expired or has already been used/i),
    "a reset link that works twice is a reset link that works for whoever else has the email",
  ).toBeVisible();
  await ctx.close();

  await restorePassword(SCHOOL_B.teacher.email);
});

test("an expired token is refused", async ({ page }) => {
  const raw = await mintFor(page, SCHOOL_C.teacher.email);
  await db.teacherPasswordToken.updateMany({
    where: { resetHash: hashPasswordToken(raw) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  await setPasswordWith(page, raw, "expired-token-passphrase");
  await expect(page.getByText(/expired or has already been used/i)).toBeVisible();
  // And the same sentence as a token that never existed, so neither tells the
  // holder which one they have.
  await setPasswordWith(page, "0".repeat(48), "invented-token-passphrase");
  await expect(page.getByText(/expired or has already been used/i)).toBeVisible();

  await restorePassword(SCHOOL_C.teacher.email);
});

test("setting a password ends every session that teacher already had", async ({ page, browser }) => {
  // A signed-in session, standing in for whoever prompted the reset.
  const intruderCtx = await browser.newContext();
  const intruder = await intruderCtx.newPage();
  await loginTeacher(intruder, SCHOOL_A.admin);
  await intruder.goto("/teacher");
  await expect(intruder.locator("body")).toContainText(/queue|classes|journals/i);

  const raw = await mintFor(page, SCHOOL_A.admin.email);
  await setPasswordWith(page, raw, "evict-the-other-session");

  // The old session must now be nobody.
  await intruder.goto("/teacher");
  await expect(
    intruder,
    "a reset that leaves the existing session alive does not evict whoever prompted it",
  ).toHaveURL(/\/login|\/$/);
  await intruderCtx.close();

  await restorePassword(SCHOOL_A.admin.email);
});

test("asking over and over is throttled, and one teacher cannot lock out the school", async ({
  page,
}) => {
  // The budget is 5 in fifteen minutes. Spend it on ONE address.
  const victim = "throttle.target@example.invalid";
  for (let i = 0; i < 6; i += 1) await requestReset(page, victim);
  const blocked = await requestReset(page, victim);
  expect(blocked, "an unthrottled reset form is a way to flood somebody's inbox").toMatch(
    /too many attempts/i,
  );

  // AND the point of keying on address+source rather than source alone: a
  // DIFFERENT teacher, from the same browser and therefore the same IP, is
  // unaffected. A school is behind one NAT, so an IP-only budget would mean the
  // fifth teacher to forget their password on the first morning of term locked
  // out everybody else in the building.
  const bystander = await requestReset(page, "someone.else@example.invalid");
  expect(
    bystander,
    "one teacher exhausting the budget must not lock out every colleague behind the same school NAT",
  ).not.toMatch(/too many attempts/i);
});

test("two submissions of the same link cannot both succeed [F61 M1]", async ({ page, browser }) => {
  // SINGLE USE UNDER CONCURRENCY, which the sequential test above does not
  // reach. The usable-check happens outside any transaction, so before the
  // spend was made conditional two submissions interleaving between the read
  // and the write both passed: two password writes, two sessions. A link
  // reaches a shared mailbox, is forwarded, or is prefetched by a school's
  // security gateway — and somebody races the teacher into a session they
  // should have been refused.
  const raw = await mintFor(page, SCHOOL_B.teacher.email);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  for (const p of [a, b]) {
    await p.goto(`/set-password?token=${raw}`);
    await p.fill("#password", "two-at-once-passphrase");
    await p.fill("#confirm", "two-at-once-passphrase");
  }

  // Fired without awaiting the first, which is the whole point.
  await Promise.all([
    a.getByRole("button", { name: /save and sign in/i }).click(),
    b.getByRole("button", { name: /save and sign in/i }).click(),
  ]);
  await a.waitForTimeout(2500);
  await b.waitForTimeout(2500);

  const landed = [a, b].filter((p) => /\/teacher/.test(p.url()));
  expect(
    landed.length,
    "exactly one of two simultaneous submissions of one link may set the password",
  ).toBe(1);

  await ctxA.close();
  await ctxB.close();
  await restorePassword(SCHOOL_B.teacher.email);
});

test("the throttle itself does not reveal whether an address is on file [F6]", async ({ page }) => {
  // THE PROPERTY THAT MAKES THE PER-ADDRESS KEY SAFE, and the reason this test
  // exists at all.
  //
  // `requestPasswordReset` keys its budget on address+source rather than source
  // alone, because a school is behind one NAT and an IP-only budget would let
  // the fifth teacher to forget their password lock out the staffroom. The
  // obvious objection is that a per-ADDRESS budget could itself become an
  // oracle: exhaust it, and if the block behaves differently for an address on
  // file than for one that is not, the form has answered the question its copy
  // refuses to answer.
  //
  // It cannot, and the reason is an ordering rather than a message:
  // `recordFailure` is called unconditionally and BEFORE the teacher lookup. So
  // the counter advances identically either way and the block arrives at the
  // same request number. This asserts that rather than trusting it, because it
  // is one moved line away from being false.
  // BOTH ADDRESSES MUST START FROM ZERO, or this test measures its own history.
  //
  // The first version used SCHOOL_A.admin — already spent one request in the
  // neutrality test above — against a fresh invented address, and duly reported
  // "on file blocks at 5, not on file blocks at 6". That is a one-request
  // difference in PRIOR USE, not in behaviour, and it is exactly the false
  // positive this file exists to avoid making. SCHOOL_B.admin is a real account
  // no other test in this file touches.
  const known = SCHOOL_B.admin.email;
  const unknown = `never.seen.${Date.now()}@example.invalid`;

  const untilBlocked = async (email: string) => {
    for (let i = 1; i <= 12; i += 1) {
      const text = await requestReset(page, email);
      if (/too many attempts/i.test(text)) return i;
    }
    return -1;
  };

  const knownAt = await untilBlocked(known);
  const unknownAt = await untilBlocked(unknown);

  expect(knownAt, "the known address was never throttled at all").toBeGreaterThan(0);
  expect(
    unknownAt,
    `an address on file blocks at request ${knownAt} and one that is not blocks at ${unknownAt} — ` +
      `the difference is an account-existence oracle, whatever the copy says`,
  ).toBe(knownAt);

  await restorePassword(known);
});

test("burning one link's attempts does not block a colleague on the same address [F61]", async ({
  page,
  browser,
}) => {
  // THE SPEND-SIDE TWIN of the request-side test above, and the same bug: this
  // throttle was keyed on the IP, so five refused links from anybody behind a
  // school firewall hard-blocked every colleague on that address for fifteen
  // minutes — including one holding a perfectly good token. That is the first
  // morning of term, when ten pilot teachers set invitation passwords from one
  // building.
  //
  // Keyed on the token's digest instead, the property is structural rather than
  // tuned: a token belongs to one person, so no amount of abuse of one can
  // reach another. This asserts it from the same browser, which is the same IP.
  const goodToken = await mintFor(page, SCHOOL_C.teacher.email);

  // Burn a DIFFERENT link past its budget. An invented token is refused every
  // time, which is what accrues failures.
  const dead = "d".repeat(48);
  for (let i = 0; i < 8; i += 1) await setPasswordWith(page, dead, "wasting-attempts-here");
  await expect(
    page.getByText(/expired or has already been used|too many attempts/i),
    "the dead link must eventually be refused, or this test proves nothing",
  ).toBeVisible();

  // The colleague, same browser and therefore same IP, holding a real link.
  const ctx = await browser.newContext();
  const colleague = await ctx.newPage();
  await setPasswordWith(colleague, goodToken, "a-colleagues-own-passphrase");
  await expect(
    colleague,
    "a valid token was refused because somebody else on the same school address burned theirs",
  ).toHaveURL(/\/teacher/);
  await ctx.close();

  await restorePassword(SCHOOL_C.teacher.email);
});

// --- helpers ---------------------------------------------------------------

/**
 * A real reset token, taken the way a teacher gets one: ask the form, then read
 * the link.
 *
 * NOT by calling the server action — Playwright cannot import a "use server"
 * module, and it should not want to. Going through the form exercises the whole
 * path the teacher uses, and it is the only way to obtain the RAW token at all,
 * because the database holds a digest. That is the point of the design, and it
 * makes this helper proof of it: if minting and lookup ever disagreed about the
 * digest, every test below would fail at once instead of the flow failing for a
 * real teacher on 1 September.
 */
async function mintFor(page: import("@playwright/test").Page, email: string) {
  await page.goto(FORGOTTEN);
  await page.fill("#email", email);
  await page.getByRole("button", { name: /send me a link/i }).click();
  const link = page.getByRole("link", { name: /open the link now/i });
  await link.waitFor({ state: "visible", timeout: 10_000 });
  const href = (await link.getAttribute("href"))!;
  return new URL(href, "http://localhost").searchParams.get("token")!;
}

async function setPasswordWith(page: import("@playwright/test").Page, token: string, pw: string) {
  await page.goto(`/set-password?token=${token}`);
  await page.fill("#password", pw);
  await page.fill("#confirm", pw);
  await page.getByRole("button", { name: /save and sign in/i }).click();
  // Settled, not slept — same reason as `requestReset` above. The form has
  // answered when it has either landed the teacher in their account or said why
  // not; a fixed delay is a guess about how busy the machine is.
  await Promise.race([
    page.waitForURL(/\/teacher/, { timeout: 15_000 }),
    page
      .getByText(/expired or has already been used|needs at least|don.t match|too many attempts/i)
      .waitFor({ state: "visible", timeout: 15_000 }),
  ]).catch(() => {});
}

/** Put the shared fixture password back; other specs sign in with it. */
async function restorePassword(email: string) {
  const bcrypt = (await import("bcryptjs")).default;
  await db.teacher.update({
    where: { email },
    data: { passwordHash: await bcrypt.hash("password", 10) },
  });
}
