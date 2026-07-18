import { test, expect } from "@playwright/test";
import { SCHOOL_A, loginTeacher } from "../helpers";

// ===========================================================================
// B4 — Responsive & device (classroom reality)
//
// Teachers use iPads and low-end laptops. Across those viewports the core pages
// must not scroll horizontally and touch targets on the core flows must be
// large enough to tap (brief floor 44px; SAFEGUARDING rule 18 asks ≥64px for
// child-facing targets — checked on the student login).
// ===========================================================================

const VIEWPORTS = [
  { label: "iPad portrait", width: 768, height: 1024 },
  { label: "iPad landscape", width: 1024, height: 768 },
  { label: "low-end laptop", width: 1280, height: 720 },
];

const PAGES = ["/", "/login/teacher", "/login/student?code=SUN234", "/family"];

for (const vp of VIEWPORTS) {
  for (const url of PAGES) {
    test(`no horizontal scroll on ${url} @ ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(url);
      // The document must not be wider than the viewport (allow 1px rounding).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${url} @ ${vp.label}`).toBeLessThanOrEqual(1);
    });
  }
}


test("child name-cards are large tap targets (≥64px) on the student login", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 }); // iPad
  await page.goto(`/login/student?code=${SCHOOL_A.classCode}`);
  const card = page.getByRole("button", { name: SCHOOL_A.student, exact: true });
  const box = await card.boundingBox();
  expect(box, "name card should be present").toBeTruthy();
  expect(box!.height, "child touch target height").toBeGreaterThanOrEqual(64);
  expect(box!.width, "child touch target width").toBeGreaterThanOrEqual(64);
});

test("core teacher actions meet the 44px touch-target floor on iPad", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher/queue");

  const buttons = page.getByRole("button", { name: /add to jar|add all|select all/i });
  const n = await buttons.count();
  expect(n, "queue should present tappable actions").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (box) expect(box.height, "touch target height").toBeGreaterThanOrEqual(44);
  }
});
