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
  await page.goto("/login/student?code=SUN123");
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
