import { test, expect, type Page, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { OPERATOR, SCHOOL_A, loginTeacher, operatorCode, ownThrottleKey, signInOperator } from "../helpers";
import { opsEnabled } from "@/lib/ops/enabled";
import { cookieContractProblem, opsCookieContract, opsCookieName } from "@/lib/ops/cookie";
import { OPS_GENERIC_FAILURE } from "@/lib/ops/messages";
import { isPublicSite } from "@/lib/indexability";

// ===========================================================================
// A21 — Operator identity, TOTP and sessions (PR1)
//
// Every negative here is paired with a positive control, and for the operator
// the pairing axis is ROLE, not tenant (handbook section 6 item 3): the same
// URL, the same fixture, two sessions. A 404 proves nothing on a route that has
// simply stopped existing, and this whole area answers 404 to everything it
// dislikes, which is precisely the condition under which a broken route looks
// like a working guard.
//
// HOW THIS SPEC SIGNS IN. With a real password and a real TOTP code computed
// from the seeded secret, by the same library the server verifies against.
// There is no bypass to use: ruling R6 deleted the proposal for a
// NODE_ENV === "test" stub, and a test below asserts that neither it nor a
// SKIP-style flag has since appeared anywhere under the ops roots.
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  // Leave the fixture as we found it, whatever failed on the way.
  await db.operator.updateMany({
    where: { email: OPERATOR.email },
    data: { status: "ACTIVE", failedAttempts: 0, lockedUntil: null },
  });
  await db.$disconnect();
});

const REPO = process.cwd();
const read = (rel: string) => readFileSync(path.join(REPO, rel), "utf8");

async function opsRow() {
  const row = await db.operator.findUnique({ where: { email: OPERATOR.email } });
  if (!row) throw new Error("the operator fixture is missing; run npm run db:seed:test");
  return row;
}

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

async function opsCookieValue(page: Page): Promise<string | undefined> {
  const all = await page.context().cookies();
  return all.find((c) => c.name === OPERATOR.cookie)?.value;
}

// A browser context with its own rate-limit key, so a spec that deliberately
// fails a sign-in never spends the budget of the spec after it.
async function ownContext(browser: Browser, label: string) {
  return browser.newContext({ extraHTTPHeaders: ownThrottleKey(label) });
}

// The door's own error node. Not getByRole("alert"): Next's router announcer
// is also role="alert", and a locator that matches two things fails strictly
// rather than telling you what the screen said.
function errorNote(page: Page) {
  return page.locator("#ops-error");
}

// The message once it has actually arrived. The node is always in the DOM (so
// assistive technology is watching the region before anything appears in it),
// which means "read it now" would usually read an empty string.
async function errorText(page: Page): Promise<string> {
  await page.waitForFunction(
    () => (document.querySelector("#ops-error")?.textContent ?? "").trim().length > 0,
  );
  return (await errorNote(page).textContent())?.trim() ?? "";
}

// Type a password-stage sign-in, and wait until the answer has actually landed:
// either the code field appeared, or the error node filled in. Without the wait
// the assertions after it race the server action's redirect.
async function enterPassword(page: Page, email: string, password: string) {
  // Start from no session. The door renders THREE different things depending on
  // what the caller already has (password form, code entry, enrolment), so a
  // second attempt in the same browser would otherwise find no email field and
  // sit there until the action timeout, which is a test-harness bug that reads
  // exactly like a broken product.
  await page.context().clearCookies();
  await page.goto("/ops/sign-in");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForFunction(
    () =>
      Boolean(document.querySelector("#code")) ||
      (document.querySelector("#ops-error")?.textContent ?? "").trim().length > 0,
  );
}

// ---------------------------------------------------------------------------
// 0. The one thing that would make every test below lie
// ---------------------------------------------------------------------------

test("the operator area is switched on for this run (otherwise every 404 below is meaningless)", async ({
  page,
}) => {
  const res = await page.goto("/ops/sign-in");
  expect(
    res?.status(),
    "the sign-in door should render. If this is 404, the dev server was started without OPS_ENABLED=1 — " +
      "kill the warm server and let Playwright start its own (see TESTING.md on warm vs cold servers).",
  ).toBe(200);
  await expect(page.getByRole("heading", { name: /^sign in$/i })).toBeVisible();
});

// ---------------------------------------------------------------------------
// 1. R17: unauthorised is 404, never 403 and never a page that names the area
// ---------------------------------------------------------------------------

test("the console is 404 to a stranger and 200 to the operator, on the same URL", async ({ page }) => {
  const anonymous = await page.goto("/ops");
  expect(anonymous?.status(), "an unauthenticated operator route must answer 404").toBe(404);
  // Not a redirect to a sign-in page either: that would name the area.
  expect(new URL(page.url()).pathname).toBe("/ops");
  const body = (await page.textContent("body")) ?? "";
  expect(body.toLowerCase()).not.toContain("operations");

  // Positive control: same URL, same fixture, the other session.
  await signInOperator(page);
  const authorised = await page.goto("/ops");
  expect(authorised?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /operations/i })).toBeVisible();
});

test("a signed-in teacher gets 404 from the console, and their own console still works", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  const denied = await page.goto("/ops");
  expect(denied?.status(), "a teacher session must not reach the operator area").toBe(404);

  // Positive control on the same cookie: it is a working session, just not this one.
  const allowed = await page.goto("/admin");
  expect(allowed?.status()).toBe(200);
});

test("the two identity systems cannot read each other's cookies", async ({ page, context }) => {
  // Direction 1: an operator session value presented as the app's cookie.
  await signInOperator(page);
  const opsValue = await opsCookieValue(page);
  expect(opsValue, "the operator cookie should exist after signing in").toBeTruthy();
  await context.clearCookies();
  await context.addCookies([
    { name: "portfolio_session", value: opsValue!, url: "http://localhost:3000" },
  ]);
  await page.goto("/teacher");
  expect(
    new URL(page.url()).pathname,
    "getCurrentUser() must be incapable of resolving an operator session value",
  ).not.toBe("/teacher");

  // Positive control for direction 1: a real teacher value in that same cookie works.
  await context.clearCookies();
  await loginTeacher(page, SCHOOL_A.admin);
  const teacherValue = (await context.cookies()).find((c) => c.name === "portfolio_session")?.value;
  expect(teacherValue).toBeTruthy();

  // Direction 2: that teacher session value presented as the operator cookie.
  await context.clearCookies();
  await context.addCookies([
    { name: OPERATOR.cookie, value: teacherValue!, url: "http://localhost:3000" },
  ]);
  const res = await page.goto("/ops");
  expect(res?.status(), "the operator resolver must be incapable of resolving a teacher session").toBe(404);
});

// ---------------------------------------------------------------------------
// 2. R7: the cookie, asserted in both directions
// ---------------------------------------------------------------------------

test("the operator cookie is httpOnly, SameSite=Strict and scoped to /", async ({ page, context }) => {
  await signInOperator(page);
  const c = (await context.cookies()).find((x) => x.name === OPERATOR.cookie);
  expect(c, `expected the cookie "${OPERATOR.cookie}" in development`).toBeTruthy();
  expect(c!.httpOnly).toBe(true);
  expect(String(c!.sameSite).toLowerCase()).toBe("strict");
  // Path "/" rather than "/ops": __Host- requires it, and a scoped path is not
  // a boundary in any case — the server check is.
  expect(c!.path).toBe("/");
  expect(c!.name).not.toBe("portfolio_session");
  const viaJs = await page.evaluate(() => document.cookie);
  expect(viaJs, "an httpOnly cookie must not be readable from JavaScript").not.toContain(c!.value);
});

test("the __Host- prefix and Secure imply each other, in both directions", () => {
  // Direction 1: production. Prefixed, Secure, Path "/", no Domain.
  const prod = opsCookieContract(true);
  expect(prod.name).toBe("__Host-sj_ops");
  expect(prod.secure).toBe(true);
  expect(prod.path).toBe("/");
  expect(prod.domain).toBeUndefined();
  expect(cookieContractProblem(prod)).toBeNull();

  // Direction 2: development over http. Not Secure, therefore NOT prefixed —
  // a __Host- cookie without Secure is refused by the browser, so the fallback
  // is the honest thing rather than a decorative name.
  const dev = opsCookieContract(false);
  expect(dev.name).toBe("sj_ops");
  expect(dev.name.startsWith("__Host-")).toBe(false);
  expect(cookieContractProblem(dev)).toBeNull();

  // And the checker itself fires, or the two assertions above prove nothing.
  expect(cookieContractProblem({ ...prod, secure: false })).toMatch(/__Host- prefix without Secure/);
  expect(cookieContractProblem({ ...dev, secure: true })).toMatch(/does not carry the __Host- prefix/);
  expect(cookieContractProblem({ ...prod, path: "/ops" as "/" })).toMatch(/path is "\/ops"/);
  expect(cookieContractProblem({ ...prod, httpOnly: false as true })).toMatch(/httpOnly/);
  expect(cookieContractProblem({ ...prod, sameSite: "lax" as "strict" })).toMatch(/SameSite/);
  expect(cookieContractProblem({ ...prod, domain: "storyjar.co.uk" as undefined })).toMatch(/Domain/);

  expect(opsCookieName(true)).toBe("__Host-sj_ops");
  expect(opsCookieName(false)).toBe("sj_ops");
});

// ---------------------------------------------------------------------------
// 3. TOTP is mandatory, monotonic, and the session rotates when it succeeds
// ---------------------------------------------------------------------------

test("a correct password alone reaches nothing, and the same session with a code reaches the console", async ({
  page,
}) => {
  await enterPassword(page, OPERATOR.email, OPERATOR.password);
  await expect(page.getByLabel(/6-digit code/i)).toBeVisible();

  const halfWay = await page.goto("/ops");
  expect(halfWay?.status(), "a password-stage session must not reach the console").toBe(404);

  // Positive control: the same browser, the same half-session, plus the code.
  await page.goto("/ops/sign-in");
  await page.fill("#code", await operatorCode());
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => url.pathname === "/ops");
  expect((await page.goto("/ops"))?.status()).toBe(200);
});

test("the session value rotates after the code, and only its hash is ever stored", async ({ page }) => {
  await enterPassword(page, OPERATOR.email, OPERATOR.password);
  const beforeCode = await opsCookieValue(page);
  expect(beforeCode).toBeTruthy();

  await page.fill("#code", await operatorCode());
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => url.pathname === "/ops");
  const afterCode = await opsCookieValue(page);

  expect(afterCode, "the pre-code identifier must not survive into the authenticated session").not.toBe(
    beforeCode,
  );
  // The rotated-away row is gone, so a captured pre-auth value is worth nothing.
  expect(await db.operatorSession.count({ where: { tokenHash: sha256(beforeCode!) } })).toBe(0);
  // The live row holds the hash, never the value.
  expect(await db.operatorSession.count({ where: { tokenHash: sha256(afterCode!) } })).toBe(1);
  expect(await db.operatorSession.count({ where: { tokenHash: afterCode! } })).toBe(0);
});

test("a code cannot be used twice, and an older code inside the window is refused too", async ({
  browser,
}) => {
  // Two full sign-ins, and a wait of up to one TOTP step in between if the
  // clock is unkind: the monotonic rule means the second sign-in cannot reuse
  // the first one's step, which is the property under test.
  test.slow();
  const ctx = await ownContext(browser, "ops-replay");
  const p = await ctx.newPage();
  try {
    const code = await operatorCode();
    await enterPassword(p, OPERATOR.email, OPERATOR.password);
    await p.fill("#code", code);
    await p.getByRole("button", { name: /^sign in$/i }).click();
    await p.waitForURL((url) => url.pathname === "/ops");
    const acceptedStep = (await opsRow()).lastTotpStep;
    expect(acceptedStep).not.toBeNull();

    // Sign out, then present the very same code again.
    await p.getByRole("button", { name: /sign out/i }).click();
    await p.waitForURL((url) => url.pathname === "/ops/sign-in");
    await enterPassword(p, OPERATOR.email, OPERATOR.password);
    await p.fill("#code", code);
    await p.getByRole("button", { name: /^sign in$/i }).click();
    await expect(errorNote(p)).toHaveText(OPS_GENERIC_FAILURE);
    expect(new URL(p.url()).pathname).toBe("/ops/sign-in");

    // Positive control: a fresh code from the same secret is accepted, so the
    // refusal above was about the STEP and not about the door being broken.
    await p.fill("#code", await operatorCode());
    await p.getByRole("button", { name: /^sign in$/i }).click();
    await p.waitForURL((url) => url.pathname === "/ops");
    expect((await opsRow()).lastTotpStep!).toBeGreaterThan(acceptedStep!);
  } finally {
    await ctx.close();
  }
});

// ---------------------------------------------------------------------------
// 4. Lockout, throttling and one sentence for every failure
// ---------------------------------------------------------------------------

test("five wrong passwords lock the account on the row, and the lock is not a message", async ({
  browser,
}) => {
  // Ten deliberate sign-in attempts, each a real page load and each running a
  // real cost-12 bcrypt compare, which is the point: the work an attacker has
  // to do is the work this test has to do.
  test.slow();
  await db.operator.update({
    where: { email: OPERATOR.email },
    data: { failedAttempts: 0, lockedUntil: null },
  });

  const attacker = await ownContext(browser, "ops-lock");
  const p = await attacker.newPage();
  try {
    // Four wrong, then the right one: the counter is counting, not blocking.
    for (let i = 0; i < 4; i += 1) {
      await enterPassword(p, OPERATOR.email, `wrong-password-${i}`);
      await expect(errorNote(p)).toHaveText(OPS_GENERIC_FAILURE);
    }
    expect((await opsRow()).failedAttempts).toBe(4);
    await enterPassword(p, OPERATOR.email, OPERATOR.password);
    await expect(p.getByLabel(/6-digit code/i)).toBeVisible();
    expect((await opsRow()).failedAttempts, "a correct password clears the counter").toBe(0);

    // Now five wrong in a row.
    for (let i = 0; i < 5; i += 1) {
      await enterPassword(p, OPERATOR.email, `wrong-password-again-${i}`);
    }
    const locked = await opsRow();
    expect(locked.lockedUntil, "the lockout is a column, so it survives a deploy or a crash").not.toBeNull();
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  } finally {
    await attacker.close();
  }

  // From a DIFFERENT source, with its own in-process throttle budget: the
  // correct password is STILL refused, which is only possible because the
  // lockout lives on the row rather than in the limiter's memory (the limiter
  // is keyed per source and knows nothing about this one). And it is refused
  // with the ordinary sentence, because "this account is locked" is "this
  // account exists".
  const elsewhere = await ownContext(browser, "ops-lock-2");
  const q = await elsewhere.newPage();
  try {
    await enterPassword(q, OPERATOR.email, OPERATOR.password);
    await expect(errorNote(q)).toHaveText(OPS_GENERIC_FAILURE);
  } finally {
    await elsewhere.close();
  }

  // Control: clear the lock and the same password works, so the refusal above
  // was the lock and not a broken form.
  await db.operator.update({
    where: { email: OPERATOR.email },
    data: { failedAttempts: 0, lockedUntil: null },
  });
  const after = await ownContext(browser, "ops-lock-3");
  const r = await after.newPage();
  try {
    await enterPassword(r, OPERATOR.email, OPERATOR.password);
    await expect(r.getByLabel(/6-digit code/i)).toBeVisible();
  } finally {
    await after.close();
  }
});

test("one sentence covers an unknown address, a wrong password and a wrong code", async ({ browser }) => {
  const ctx = await ownContext(browser, "ops-generic");
  const p = await ctx.newPage();
  try {
    await enterPassword(p, "nobody@storyjar.test", "not-a-real-password");
    const unknown = await errorText(p);

    await enterPassword(p, OPERATOR.email, "not-the-right-password");
    const wrongPassword = await errorText(p);

    await enterPassword(p, OPERATOR.email, OPERATOR.password);
    await p.fill("#code", "000000");
    await p.getByRole("button", { name: /^sign in$/i }).click();
    const wrongCode = await errorText(p);

    expect(unknown).toBe(OPS_GENERIC_FAILURE);
    expect(wrongPassword).toBe(OPS_GENERIC_FAILURE);
    expect(wrongCode).toBe(OPS_GENERIC_FAILURE);

    // Wrong CODES accumulate on the row, exactly as wrong passwords do, and it
    // has to be TWO of them to prove it: a single wrong code leaves the counter
    // at one whether the code adds to the previous value or overwrites it, and
    // overwriting was the actual bug. Five wrong codes must lock the account,
    // or the code stage can be ground at the in-process rate limit for as long
    // as the attacker likes.
    expect((await opsRow()).failedAttempts).toBe(1);
    await p.fill("#code", "111111");
    await p.getByRole("button", { name: /^sign in$/i }).click();
    // Polled on the row rather than on the screen: the second failure renders
    // the identical sentence, so the DOM does not change and there is nothing
    // on the page to wait for.
    await expect
      .poll(async () => (await opsRow()).failedAttempts, { timeout: 15_000 })
      .toBe(2);
  } finally {
    await ctx.close();
    await db.operator.update({
      where: { email: OPERATOR.email },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }
});

test("the throttle is checked before any bcrypt work happens", () => {
  // A timing assertion here would be flaky and would prove less than it looks.
  // What matters is the ORDER of the two calls on the sign-in path, and that is
  // readable: bcryptjs is pure JavaScript, a cost-12 compare is ~200ms of CPU,
  // this service runs at one replica, and an unauthenticated endpoint that runs
  // one per request is a denial-of-service lever against every school on it.
  const src = read("src/lib/ops/session.ts");
  const signIn = src.slice(src.indexOf("export async function startOperatorSignIn"));
  const throttleAt = signIn.indexOf("await throttled(");
  const hashAt = Math.min(
    ...["operatorPasswordMatches(", "burnEqualWork("].map((needle) => {
      const at = signIn.indexOf(needle);
      return at === -1 ? Number.MAX_SAFE_INTEGER : at;
    }),
  );
  expect(throttleAt, "the throttle check should be in startOperatorSignIn").toBeGreaterThan(-1);
  expect(hashAt, "a bcrypt compare should be in startOperatorSignIn").toBeLessThan(Number.MAX_SAFE_INTEGER);
  expect(throttleAt, "the rate-limit check must come before the hash work").toBeLessThan(hashAt);
});

// ---------------------------------------------------------------------------
// 5. Disabling, recovery codes, enrolment
// ---------------------------------------------------------------------------

test("disabling the operator ends the session on the very next request", async ({ page }) => {
  // Two full sign-ins, and on a cold server this landed at 54 seconds of a
  // 60-second budget. Slow rather than flaky.
  test.slow();
  await signInOperator(page);
  expect((await page.goto("/ops"))?.status()).toBe(200);

  await db.operator.update({ where: { email: OPERATOR.email }, data: { status: "DISABLED" } });
  expect((await page.goto("/ops"))?.status(), "a disabled operator is refused immediately").toBe(404);
  const operatorId = (await opsRow()).id;
  expect(
    await db.operatorSession.count({ where: { operatorId } }),
    "and EVERY session row is gone, not merely the one that asked and not merely ignored",
  ).toBe(0);

  // Positive control: re-enabled, the same credentials work again, so the 404
  // above was the status flag and not a broken sign-in.
  await db.operator.update({ where: { email: OPERATOR.email }, data: { status: "ACTIVE" } });
  await signInOperator(page);
  expect((await page.goto("/ops"))?.status()).toBe(200);
});

test("a printed recovery code works exactly once", async ({ browser }) => {
  const ctx = await ownContext(browser, "ops-recovery");
  const p = await ctx.newPage();
  try {
    const before = await opsRow();
    const used = JSON.parse(before.recoveryCodesJson).filter(
      (e: { usedAt: string | null }) => e.usedAt !== null,
    ).length;

    // Pick two codes that have not been spent by an earlier run of this spec.
    const first = OPERATOR.recoveryCodes[used];
    const second = OPERATOR.recoveryCodes[used + 1];

    await enterPassword(p, OPERATOR.email, OPERATOR.password);
    await p.fill("#code", first);
    await p.getByRole("button", { name: /^sign in$/i }).click();
    await p.waitForURL((url) => url.pathname === "/ops");

    await p.getByRole("button", { name: /sign out/i }).click();
    await p.waitForURL((url) => url.pathname === "/ops/sign-in");

    // The same code again is refused: single use means single use.
    await enterPassword(p, OPERATOR.email, OPERATOR.password);
    await p.fill("#code", first);
    await p.getByRole("button", { name: /^sign in$/i }).click();
    await expect(errorNote(p)).toHaveText(OPS_GENERIC_FAILURE);

    // Positive control: the next unused code is accepted.
    await p.fill("#code", second);
    await p.getByRole("button", { name: /^sign in$/i }).click();
    await p.waitForURL((url) => url.pathname === "/ops");

    const after = await opsRow();
    const nowUsed = JSON.parse(after.recoveryCodesJson).filter(
      (e: { usedAt: string | null }) => e.usedAt !== null,
    ).length;
    expect(nowUsed).toBe(used + 2);
  } finally {
    await ctx.close();
    await db.operator.update({
      where: { email: OPERATOR.email },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }
});

test("enrolment happens behind the password, and confirming it is a real code", async ({ page }) => {
  const secretHead = OPERATOR.totpSecret.slice(0, 8);

  // Nothing about the secret is on the door before the password.
  await page.goto("/ops/sign-in");
  expect(await page.content()).not.toContain(secretHead);

  await db.operator.update({
    where: { email: OPERATOR.email },
    data: { totpConfirmedAt: null, lastTotpStep: null },
  });
  try {
    await enterPassword(page, OPERATOR.email, OPERATOR.password);
    await expect(page.getByRole("heading", { name: /set up your authenticator/i })).toBeVisible();
    // The setup key is shown as text, in groups. No QR image: nothing under ops
    // renders an image of any kind, so no screen here can ever show a child's
    // photograph.
    expect(await page.content()).toContain(secretHead);
    expect(await page.locator("img").count()).toBe(0);

    await page.fill("#code", await operatorCode());
    await page.getByRole("button", { name: /confirm/i }).click();
    await page.waitForURL((url) => url.pathname === "/ops");
    expect((await opsRow()).totpConfirmedAt).not.toBeNull();
  } finally {
    const row = await opsRow();
    if (!row.totpConfirmedAt) {
      await db.operator.update({
        where: { email: OPERATOR.email },
        data: { totpConfirmedAt: new Date() },
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 6. The kill switch, the absence of a bypass, and R18
// ---------------------------------------------------------------------------

test("OPS_ENABLED is off unless it is exactly \"1\", and both guards check it first", () => {
  expect(opsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  expect(opsEnabled({ OPS_ENABLED: "" } as NodeJS.ProcessEnv)).toBe(false);
  expect(opsEnabled({ OPS_ENABLED: "0" } as NodeJS.ProcessEnv)).toBe(false);
  expect(opsEnabled({ OPS_ENABLED: "true" } as NodeJS.ProcessEnv)).toBe(false);
  expect(opsEnabled({ OPS_ENABLED: "yes" } as NodeJS.ProcessEnv)).toBe(false);
  expect(opsEnabled({ OPS_ENABLED: "1" } as NodeJS.ProcessEnv)).toBe(true);

  // The predicate is only worth anything if both guards consult it before they
  // do anything else. Asserted on the source because the running server cannot
  // have its environment changed underneath it, and a spec that quietly proved
  // less than it claimed would be worse than this one, which says what it does.
  const src = read("src/lib/ops/session.ts");
  for (const guard of ["requireOperator", "requireOpsDoor"]) {
    const start = src.indexOf(`export async function ${guard}(`);
    expect(start, `${guard} should exist`).toBeGreaterThan(-1);
    const body = src.slice(src.indexOf("{", start) + 1).trimStart();
    expect(body.startsWith("if (!opsEnabled()) notFound();"), `${guard} must check the kill switch first`).toBe(
      true,
    );
  }
});

test("no test-only bypass exists anywhere under the ops roots", () => {
  const roots = ["src/lib/ops", "src/app/ops", "src/app/actions/ops"];
  const files: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSyncSafe(rel)) {
      const child = `${rel}/${entry}`;
      if (isDir(child)) walk(child);
      else if (/\.(ts|tsx)$/.test(child)) files.push(child);
    }
  };
  for (const r of roots) walk(r);
  expect(files.length, "the ops roots should hold code").toBeGreaterThan(0);

  for (const f of files) {
    const src = read(f);
    expect(src, `${f} must not branch on a test environment`).not.toMatch(
      /NODE_ENV\s*[=!]==?\s*["'](test|development)["']/,
    );
    expect(src, `${f} must not carry a skip/bypass flag`).not.toMatch(/\b(SKIP|BYPASS)_[A-Z_]+\b/);
  }
});

test("nothing anywhere links to the operator area", async ({ page }) => {
  const publicPages = ["/", "/login/teacher", "/family", "/legal", "/signup/teacher"];
  for (const url of publicPages) {
    await page.goto(url);
    const hrefs = await page.locator("a[href]").evaluateAll((as) =>
      as.map((a) => a.getAttribute("href") ?? ""),
    );
    expect(hrefs.filter((h) => h.startsWith("/ops") || h.includes("/ops/")), `${url} links to ops`).toEqual([]);
  }

  // And behind the school console's own login, where a curious admin looks.
  await loginTeacher(page, SCHOOL_A.admin);
  for (const url of ["/teacher", "/admin"]) {
    await page.goto(url);
    const hrefs = await page.locator("a[href]").evaluateAll((as) =>
      as.map((a) => a.getAttribute("href") ?? ""),
    );
    expect(hrefs.filter((h) => h.startsWith("/ops")), `${url} links to ops`).toEqual([]);
  }

  // Nor does the one file whose whole job is to be fetched by strangers.
  //
  // This assertion used to read `status()).toBe(404)`, because there was no
  // robots.txt at all. src/app/robots.ts added one on 29 Aug 2026 to keep the
  // staging deployment out of the search index, and the 404 assertion fired —
  // which is what it was for: the comment here asked whoever added a robots.txt
  // to decide deliberately what it says. The decision is that it names NO path.
  //
  // A robots.txt is the worst possible place to write "/ops". It is world-
  // readable by design, so a disallow entry naming the operator area would
  // publish the path to precisely the people the entry is meant to deter. The
  // area is kept out of the index by the X-Robots-Tag header in next.config.ts
  // instead, and the disallow that protects staging is a bare "/".
  //
  // So the property is unchanged and the gate is not weakened: nothing that a
  // stranger can fetch names the operator area.
  const robots = await page.goto("/robots.txt");
  expect(robots?.status(), "robots.txt should be served").toBe(200);
  expect(await robots!.text(), "robots.txt must not name the operator area").not.toContain("/ops");

  // Still nothing here. A sitemap enumerates paths by definition, so if one is
  // ever added this fails and the same decision has to be taken again.
  expect((await page.goto("/sitemap.xml"))?.status()).toBe(404);
});

test("operator responses are never indexed and never cached", async ({ page }) => {
  const res = await page.goto("/ops/sign-in");
  expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");

  // Cache-Control is asserted in two halves, because `next dev` replaces the
  // configured value with its own "no-cache, must-revalidate" and `next start`
  // does not. Verified by hand against a production build on 2026-08-17:
  //   curl -I /ops/sign-in  ->  Cache-Control: private, no-store
  //   curl -I /ops (404)    ->  Cache-Control: private, no-store
  // So: the response must be uncacheable in whatever environment this runs in,
  // AND the configuration must still declare the strict pair, which is the half
  // a deletion would break.
  expect(res?.headers()["cache-control"] ?? "").toMatch(/no-store|no-cache/);
  const config = read("next.config.ts");
  expect(config).toContain('"/ops", "/ops/:path*"');
  expect(config).toContain('value: "private, no-store"');
  expect(config).toContain('value: "noindex, nofollow, noarchive"');

  // Control: on the public site the header is scoped to this area rather than
  // sitting on everything, which is what would make the assertion above vacuous.
  //
  // A non-public deployment is the one case where it IS on everything, because
  // next.config.ts noindexes staging wholesale (see src/lib/indexability.ts).
  // The control is therefore branched rather than deleted: on staging the header
  // assertion above genuinely proves nothing, and what carries the weight there
  // is the next.config.ts source assertions above, which hold either way.
  const landing = await page.goto("/");
  if (isPublicSite(process.env.APP_URL)) {
    expect(landing?.headers()["x-robots-tag"]).toBeUndefined();
  } else {
    expect(landing?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  }
});

// ---------------------------------------------------------------------------
// 7. The audit trail
// ---------------------------------------------------------------------------

test("a sign-in is audited, and no audit row holds a credential", async ({ page }) => {
  await signInOperator(page);
  const cookieValue = await opsCookieValue(page);

  const signIns = await db.opsAuditLog.findMany({ where: { action: "OPS_SIGN_IN" } });
  expect(signIns.length, "a completed sign-in should be recorded").toBeGreaterThan(0);

  const rows = await db.opsAuditLog.findMany();
  const blob = JSON.stringify(rows);
  for (const secret of [OPERATOR.password, OPERATOR.totpSecret, cookieValue!, ...OPERATOR.recoveryCodes]) {
    expect(blob, "the audit trail must never carry a credential value").not.toContain(secret);
  }
  // Nor a failed attempt's address in the clear.
  expect(blob).not.toContain("nobody@storyjar.test");
});

// Small local helpers for the static walk above, kept at the bottom so the
// tests read first.
function readdirSyncSafe(rel: string): string[] {
  try {
    return readdirSync(path.join(REPO, rel));
  } catch {
    return [];
  }
}
function isDir(rel: string): boolean {
  try {
    return statSync(path.join(REPO, rel)).isDirectory();
  } catch {
    return false;
  }
}
