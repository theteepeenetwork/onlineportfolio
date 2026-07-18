import { test, expect, type Page } from "@playwright/test";
import { teacherLogin } from "./helpers";

// A class code could not be changed by anyone — so a leaked code (an excluded
// parent, a code shared too widely) had no remedy short of deleting the class
// and rebuilding it by hand. Rotation is that remedy (F16), and the whole point
// is that the OLD code stops working and a NEW one starts.
//
// This runs against a THROWAWAY class it creates itself, never the shared seed:
// rotating SUN234 would break every later spec that signs a child in with it
// (the classic test-pollution trap — see the memory note).

// Create an isolated class with one pupil; return its code and open detail.
//
// The class name is made unique per run so it can never collide with a class
// left by another spec (the teacher account accumulates classes across the
// suite) — a stale same-named class is exactly how the code and the pupil could
// end up pointing at different classes.
async function makeClassWithPupil(page: Page, prefix: string, pupil: string) {
  const className = `${prefix} ${Date.now()}`;
  await teacherLogin(page);
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /New class/ }).click();
  await page.locator("#className").fill(className);
  await page.getByRole("button", { name: /^Create class/ }).click();

  // Open the class we just made — the unique name matches exactly one card.
  await page.getByRole("button", { name: new RegExp(className) }).click();
  await expect(page.getByRole("heading", { name: className })).toBeVisible();

  // Add the pupil, then read the code from the SAME open detail, so the two are
  // provably the same class.
  const code = ((await page.locator('p:has-text("class code") strong').first().textContent()) ?? "").trim();
  expect(code, "the class has a code").toMatch(/^[A-Z0-9]{6}$/);

  await page.getByRole("button", { name: /^＋ Add pupil$/ }).click();
  await page.getByLabel(/Add pupils/).fill(pupil);
  await page.getByRole("button", { name: /^Add pupil$/ }).click();

  // Wait for the pupil to be on the class SERVER-SIDE, not just optimistically in
  // the teacher UI. The add is a server action + revalidate; the roster can show
  // the name a beat before a fresh sign-in query would see it, and navigating on
  // that early read is a race — the name wall then reads "No names here yet".
  // The login page is the ground truth the rest of the test depends on.
  await expect
    .poll(
      async () => (await (await page.request.get(`/login/student?code=${code}`)).text()).includes(`>${pupil}<`),
      { message: `pupil "${pupil}" should reach the class server-side`, timeout: 15_000 },
    )
    .toBe(true);

  return { code, className };
}

async function rotateOpenClass(page: Page) {
  await page.getByRole("button", { name: /New class code/ }).click();
  const dialog = page.getByRole("dialog", { name: /new class code for/i });
  await dialog.getByRole("button", { name: /Yes, new code/ }).click();
  await expect(dialog.getByRole("heading", { name: /new code ready/i })).toBeVisible();
  const code = ((await dialog.locator('p[style*="40px"]').textContent()) ?? "").trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return code;
}

test("a new code retires the old one — old stops working, new starts", async ({ page }) => {
  const { code: oldCode, className } = await makeClassWithPupil(page, "Rotato", "Robin");

  // The code works today: it reaches the name wall.
  await page.goto(`/login/student?code=${oldCode}`);
  await expect(page.getByRole("heading", { name: /tap your name/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Robin", exact: true })).toBeVisible();

  // Teacher rotates it.
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: new RegExp(className) }).click();
  await page.getByRole("button", { name: /Class settings/ }).click();
  const newCode = await rotateOpenClass(page);
  expect(newCode).not.toBe(oldCode);

  // The OLD code no longer finds the class — back at the code screen.
  await page.goto(`/login/student?code=${oldCode}`);
  await expect(page.getByRole("heading", { name: /what's your class code/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /tap your name/i })).toHaveCount(0);

  // The NEW code does.
  await page.goto(`/login/student?code=${newCode}`);
  await expect(page.getByRole("heading", { name: /tap your name/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Robin", exact: true })).toBeVisible();
});

test("rotating a code does not sign an already-logged-in child out", async ({ page, browser }) => {
  const { code, className } = await makeClassWithPupil(page, "Steady", "Sam");

  // Sam signs in — on their OWN device (a separate context: a student and a
  // teacher can't share one browser, there's a single session cookie).
  const childCtx = await browser.newContext();
  const child = await childCtx.newPage();
  await child.goto(`/login/student?code=${code}`);
  await child.getByRole("button", { name: "Sam", exact: true }).click();
  await child.waitForURL((u) => u.pathname === "/student");

  // The teacher rotates the code (this page is still the teacher's session).
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: new RegExp(className) }).click();
  await page.getByRole("button", { name: /Class settings/ }).click();
  await rotateOpenClass(page);

  // Sam reloads — still signed in, still their jar. The session is tied to Sam's
  // pupil id, not to the code: rotation changes who can START a sign-in, not who
  // is already in.
  await child.reload();
  await expect(child).toHaveURL((u) => u.pathname === "/student");
  await expect(child.getByText("Sam's jar")).toBeVisible();
  await childCtx.close();
});
