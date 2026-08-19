import type { Page } from "@playwright/test";
import type { Tester } from "./tester";
import { OPERATOR, operatorCode } from "../helpers";

// ===========================================================================
// The doors, as the personas go through them.
//
// Deliberately NOT the battery's own login helpers (../helpers): those assert,
// and an assertion is the wrong shape here. When a persona cannot get in, that
// is the most important observation in the report — "I could not sign in" — and
// the journey should stop cleanly rather than throw a stack trace at a stranger.
// ===========================================================================

/** Sign in as a member of staff by email and password. */
export async function signIn(t: Tester, page: Page, who: { email: string; password: string }) {
  await t.open("/login/teacher", "the teacher sign-in page");
  await t.act("sign in with my email and password", async () => {
    await page.fill("#email", who.email);
    await page.fill("#password", who.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/teacher" || url.pathname === "/admin");
  });
  await t.sweep("my home page after signing in");
}

/** Sign in as a child: type the class code, then tap your own name. */
export async function signInChild(t: Tester, page: Page, code: string, name: string) {
  await t.open(`/login/student?code=${code}`, "the name wall");
  await t.act(`tap my own name (${name})`, async () => {
    await page.getByRole("button", { name, exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/student");
  });
  await t.sweep("my jar");
}

/** Sign in as a parent with the code from the letter. */
export async function signInParent(t: Tester, page: Page, familyCode: string) {
  await t.open("/family", "the family sign-in page");
  await t.act("open the family-code form", async () => {
    await page.getByRole("button", { name: /family code from your letter/i }).click();
  });
  await t.act("type the code from the letter", async () => {
    await page.getByLabel(/family code from your letter/i).fill(familyCode);
    await page.getByRole("button", { name: /^sign in$/i }).click();
  });
  await t.sweep("my child's page");
}

/**
 * Sign in as the platform operator: password, then a code from the
 * authenticator. There is no bypass and no fixture flag — the tester computes a
 * genuine TOTP code with the same library the server checks it against (see
 * ../helpers, and handbook ruling R6). One code, one attempt: a retry loop
 * counts failures against the real account and five of those lock it.
 */
export async function signInOperator(t: Tester, page: Page) {
  await page.context().clearCookies();
  await t.open("/ops/sign-in", "the operations door");
  await t.act("enter my email and password", async () => {
    await page.fill("#email", OPERATOR.email);
    await page.fill("#password", OPERATOR.password);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/6-digit code/i).waitFor({ state: "visible" });
  });
  await t.act("type the code from my authenticator app", async () => {
    await page.fill("#code", await operatorCode());
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => url.pathname === "/ops");
  });
  await t.sweep("the operations console");
}

/** Leave, the way a shared classroom device makes you. */
export async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** A drawn stroke, made with real pointer input on whatever canvas is open. */
export async function scribble(page: Page) {
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible" });
  // Pick up the pen if there is one. Templates open on the finger/Select tool,
  // a blank page may not, and the tools differ between the two canvases — so
  // this is a short, optional attempt rather than the project's 15-second
  // action timeout spent waiting for a button that was never going to appear.
  const pen = page.locator('button[title="Pen"], button[aria-label="Pen"]');
  if (await pen.count()) await pen.first().click({ timeout: 2000 }).catch(() => {});
  const box = await canvas.boundingBox();
  if (!box) return;
  const x = box.x + box.width * 0.3;
  const y = box.y + box.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 16, y + Math.sin(i / 2) * 26);
  await page.mouse.up();
}
