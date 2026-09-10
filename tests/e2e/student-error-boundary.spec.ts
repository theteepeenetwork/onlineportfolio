import { test, expect } from "@playwright/test";
import { studentLogin } from "./helpers";

// A page under /student that fails while it is being drawn must be a way out,
// not a wall (FINDINGS F74). `src/app/student/error.tsx` is the boundary;
// `DevThrow` is the dev-only fixture that lets a test reach it, because no
// route fails on purpose. Both ways out sit at the child touch floor
// (SAFEGUARDING rule 18) and are judged by their accessible name, the way the
// persona sweep judges every way out.

const GIVEAWAYS = ["operator", "operations", "console", "sign in", "permission", "access", "admin", "undefined", "application error"];

// Chromium never exposes a `sendBeacon` body to the test runner, so the tests
// take the reporter's `fetch` fallback instead, which carries the same JSON
// and can be read. The product still sends a beacon.
async function readableBeacons(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true });
  });
}

test("a page that fails offers another go and the jar, and says nothing about why", async ({ page }) => {
  await readableBeacons(page);
  await studentLogin(page, "Amara");

  const beacon = page.waitForRequest((r) => r.url().endsWith("/api/client-error") && r.method() === "POST");
  await page.goto("/student/activities?sj-throw=1");

  const again = page.getByRole("button", { name: "Have another go" });
  const jar = page.getByRole("link", { name: "Back to my jar" });
  await expect(again, "the retry is the thing a child taps first").toBeVisible();
  await expect(jar).toBeVisible();
  for (const el of [again, jar]) {
    const box = (await el.boundingBox())!;
    expect(box.height, "the way out is at the child floor").toBeGreaterThanOrEqual(64);
  }

  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const giveaway of GIVEAWAYS) {
    expect(text, `the boundary mentions "${giveaway}"`).not.toContain(giveaway);
  }
  expect(text).not.toContain("test boundary"); // the thrown text never reaches the page

  // The failure was reported, by class name and place only.
  const req = await beacon;
  const body = req.postData() ?? "";
  expect(body).toContain('"kind":"boundary"');
  expect(body).toContain('"name":"Error"');
  expect(body).not.toContain("message");
  expect(body).not.toContain("test boundary");
  expect(body).not.toContain("sj-throw"); // the route pattern drops the query

  await jar.click();
  await page.waitForURL((u) => u.pathname === "/student");
  await expect(page.getByRole("button", { name: "Have another go" })).toHaveCount(0);
});

test("a page that ended without unloading is reported on the next load, and a clean exit is not", async ({ page }) => {
  await readableBeacons(page);
  await studentLogin(page, "Amara");
  await page.goto("/student");

  // Pretend the last document died mid-lesson: the marker it wrote is still
  // there because `pagehide` never fired. The next load must say so.
  await page.evaluate(() =>
    sessionStorage.setItem("sj-alive", JSON.stringify({ route: "/student/new/:type", at: Date.now() })),
  );
  const beacon = page.waitForRequest((r) => r.url().endsWith("/api/client-error") && r.method() === "POST");
  // Reload without letting pagehide clear the marker: navigate via the
  // address bar equivalent after re-seeding on the way out.
  await page.evaluate(() => {
    window.addEventListener("pagehide", () => {
      sessionStorage.setItem("sj-alive", JSON.stringify({ route: "/student/new/:type", at: Date.now() }));
    });
  });
  await page.reload();
  const body = (await beacon).postData() ?? "";
  expect(body).toContain('"kind":"unclean-exit"');
  expect(body).toContain('"route":"/student/new/:type"');

  // A clean navigation leaves a fresh marker for the new page, not the old one.
  await page.goto("/student/new/drawing");
  // The marker is written by an effect, so it lands a moment after the page does.
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("sj-alive") ?? ""))
    .toContain('"route":"/student/new/drawing"');
});
