import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SCHOOL_A, loginTeacher } from "../helpers";

// ===========================================================================
// A2 — Authentication & sessions
//
// Session fixation, logout invalidation, cookie flags, and behaviour on an
// invalid/tampered session token (SAFEGUARDING.md rule 13). These are the
// correct-today behaviours, so they gate merges.
// ===========================================================================

const COOKIE = "portfolio_session";

function sessionCookie(cookies: { name: string; value: string }[]) {
  return cookies.find((c) => c.name === COOKIE);
}

test("a fresh session token is minted on login (no fixation)", async ({ page, context }) => {
  // Anonymous: no session cookie.
  await page.goto("/login/teacher");
  expect(sessionCookie(await context.cookies())).toBeUndefined();

  await loginTeacher(page, SCHOOL_A.admin);

  const c = sessionCookie(await context.cookies());
  expect(c, "session cookie should be set after login").toBeTruthy();
  expect(c!.value.length).toBeGreaterThanOrEqual(32); // 32 random bytes, hex
});

test("session cookie is HttpOnly + SameSite=Lax, scoped to /", async ({ page, context }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  const c = sessionCookie(await context.cookies())!;
  expect(c.httpOnly, "cookie must be HttpOnly").toBe(true);
  expect(String(c.sameSite).toLowerCase()).toBe("lax");
  expect(c.path).toBe("/");
  // HttpOnly is also observable: the token must not be readable from JS.
  const viaJs = await page.evaluate(() => document.cookie);
  expect(viaJs).not.toContain(c.value);
});

test("logout invalidates the session server-side (token no longer works)", async ({ page, context }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  const token = sessionCookie(await context.cookies())!.value;

  // Log out (clears the cookie AND deletes the session row).
  await page.goto("/teacher");
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await page.waitForURL((url) => url.pathname === "/");

  // Re-plant the exact old token and try to reach a protected page.
  await context.addCookies([
    { name: COOKIE, value: token, url: SCHOOL_A_ORIGIN(page) },
  ]);
  const res = await page.goto("/teacher");
  // The deleted session must not authenticate — the app bounces to the entry.
  expect(new URL(res!.url()).pathname).not.toBe("/teacher");
});

test("a tampered/garbage session token grants nothing", async ({ page, context }) => {
  await page.goto("/");
  await context.addCookies([
    { name: COOKIE, value: "deadbeef".repeat(8), url: SCHOOL_A_ORIGIN(page) },
  ]);
  const res = await page.goto("/teacher");
  expect(new URL(res!.url()).pathname).not.toBe("/teacher"); // redirected to entry
});

test("sign-out clears the cookie even when the session row cannot be deleted", () => {
  // A dev database reseeded under a running server, a full disk, a read-only
  // volume: the DELETE fails and `destroySession` is mid-flight. If the cookie
  // is only cleared after that write succeeds, the child taps "Sign out", sees
  // an error, and is STILL SIGNED IN — on a device the next child picks up.
  // So the order is the control, and it is asserted here rather than by
  // breaking a real database mid-suite.
  const src = readFileSync(path.join(process.cwd(), "src/lib/auth.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function destroySession"));
  const fn = body.slice(0, body.indexOf("\n}") + 2);

  const clearsCookie = fn.indexOf("cookieStore.delete(COOKIE_NAME)");
  const deletesRow = fn.indexOf("deleteMany");

  expect(clearsCookie, "destroySession must clear the cookie").toBeGreaterThan(-1);
  expect(deletesRow, "destroySession must delete the session row").toBeGreaterThan(-1);
  expect(
    clearsCookie,
    "clear the cookie BEFORE the write that can fail: on error, deny",
  ).toBeLessThan(deletesRow);
  expect(
    /catch\s*\(/.test(fn),
    "the row delete must be caught, so a failed write still redirects a signed-out user away",
  ).toBe(true);
});

// The page origin, needed to plant cookies via context.addCookies.
function SCHOOL_A_ORIGIN(page: import("@playwright/test").Page) {
  return new URL(page.url()).origin;
}
