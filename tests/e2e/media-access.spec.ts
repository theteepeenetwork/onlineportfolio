import { test, expect } from "@playwright/test";
import { teacherLogin, studentLogin, logout } from "./helpers";

// Children's media must never be a public file. /uploads/<file> is served only
// to a requester entitled to see that child's work (SAFEGUARDING.md rules 4 & 7).
// seed-sun.svg is referenced by Sunflower journal items owned by the demo teacher.
const MEDIA = "/uploads/seed-sun.svg";

async function fetchStatus(page: import("@playwright/test").Page, url: string) {
  return page.evaluate((u) => fetch(u, { credentials: "include" }).then((r) => r.status), url);
}

test.describe("Media access control", () => {
  test("the class's own teacher can load its media", async ({ page }) => {
    await teacherLogin(page);
    expect(await fetchStatus(page, MEDIA)).toBe(200);
  });

  test("a child in the class can load it; anonymous cannot", async ({ page }) => {
    await studentLogin(page, "Amara");
    expect(await fetchStatus(page, MEDIA)).toBe(200);

    await logout(page);
    await page.goto("/"); // an origin to fetch from, but signed out
    expect(await fetchStatus(page, MEDIA)).toBe(404);
  });

  test("a different teacher cannot load another class's media", async ({ page }) => {
    // Miss Malik (seeded staff) teaches Butterflies, not Sunflower.
    await page.goto("/login/teacher");
    await page.fill("#email", "a.malik@stbedes.sch.uk");
    await page.fill("#password", "password");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname === "/teacher");
    expect(await fetchStatus(page, MEDIA)).toBe(404);
  });

  test("path traversal and unknown files are refused", async ({ page }) => {
    await teacherLogin(page);
    expect(await fetchStatus(page, "/uploads/nope-does-not-exist.png")).toBe(404);
    // A traversal attempt never reaches a real file.
    const status = await fetchStatus(page, "/uploads/%2e%2e%2fpackage.json");
    expect(status === 400 || status === 404).toBeTruthy();
  });
});
