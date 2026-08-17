import { type Page, expect } from "@playwright/test";

// Sign in as the demo teacher. Waits on the dashboard content, because a URL
// like "/login/teacher" would otherwise match a "**/teacher" glob.
export async function teacherLogin(page: Page) {
  await page.goto("/login/teacher");
  await page.fill("#email", "teacher@school.uk");
  await page.fill("#password", "password");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/teacher");
}

// Sign in as a student by class code + tapping their name.
export async function studentLogin(page: Page, name: string) {
  await page.goto("/login/student?code=SUN234");
  // Exact match so e.g. "Dev" doesn't also hit the "Dev Tools" button.
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
}

// Open a child's blank drawing canvas. The Drawing tile on their jar deep-links
// straight to it — there is no intermediate "which kind?" screen any more
// (SJ-03), and this is the one place that knows the route.
export async function openDrawing(page: Page) {
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();
}

// Log out by clearing the session cookie.
export async function logout(page: Page) {
  await page.context().clearCookies();
}

// Draw a short stroke across the (full-screen) canvas using real pointer input.
export async function drawOnCanvas(page: Page) {
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  // Templates open on the finger/Select tool, so pick the Pen before drawing.
  const pen = page.locator('button[title="Pen"]');
  if (await pen.count()) await pen.first().click();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  const x = box.x + box.width * 0.3;
  const y = box.y + box.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x + i * 18, y + Math.sin(i / 2) * 30);
  }
  await page.mouse.up();
}

// How many pages are currently captured in a canvas's hidden field.
export async function pageCount(page: Page, field: string): Promise<number> {
  const raw = (await page.locator(`input[name="${field}"]`).inputValue()) || "[]";
  try {
    return (JSON.parse(raw) as unknown[]).length;
  } catch {
    return 0;
  }
}

// Click a button only once React has actually wired it up.
//
// Playwright's actionability checks are satisfied by server-rendered HTML: the
// button is visible, enabled and stable long before React attaches its onClick.
// A click landing in that window is swallowed in silence. There is no error and
// no effect, so the test fails later on whatever the click was meant to produce,
// which reads exactly like a product bug and is not one.
//
// This bites after `page.reload()`, where the markup comes back almost at once
// and the JavaScript does not. It is the second, independent cause of the F34
// flake: a restore prompt cannot appear if the editor never opened. On 17 August
// 2026 it failed the same way on every run, locally and in CI, and a six second
// sleep in the same place made it pass, which is what identified it.
//
// The signal is React's own. On hydrating a node it stores its props on the DOM
// element under a `__reactProps$…` key, so that key existing is the element
// saying "my handlers are attached". It is a React internal, and it is still the
// honest choice: the alternative is a fixed sleep racing the very unknown the
// helper exists to remove.
export async function clickHydrated(page: Page, name: RegExp) {
  const button = page.getByRole("button", { name });
  await expect(button).toBeVisible();
  await page.waitForFunction(
    (source) => {
      const re = new RegExp(source);
      const el = Array.from(document.querySelectorAll("button")).find((b) =>
        re.test(b.textContent ?? ""),
      );
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps$"));
    },
    name.source,
    { timeout: 30_000 },
  );
  await button.click();
}
