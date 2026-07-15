import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// A teacher can place objects on a template and choose, per object, whether a
// pupil may move it: a padlock (open by default) locks it when tapped. Locked
// objects are fixed for pupils; unlocked ones can be dragged. When the teacher
// re-opens their own template every object is editable again.
test("teacher padlock locks an object so pupils can't move it; unlocked stays movable", async ({
  page,
}) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Sort into the Venn");
  await page.getByRole("button", { name: /Build a template/ }).click();

  const addShape = async (name: string) => {
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name }).click();
  };

  // The objects drawn on the canvas. Scoped to their wrappers deliberately: a
  // bare "svg path[stroke]" also matches Next's dev-tools overlay, which lives
  // in a shadow root that Playwright's CSS engine pierces, and which renders
  // stroked icons while the dev server is compiling. That made this test pass
  // against a warm server and fail against a cold one — i.e. always, on CI.
  const objectPaths = page.locator("div.touch-none svg path[stroke]");

  // First shape: a fixed piece. Move it aside so the two don't overlap, then
  // lock it with its padlock (open → closed).
  await addShape("Rectangle");
  const rect = objectPaths.first();
  const rectWrap = rect.locator("xpath=ancestor::div[1]");
  const rb = (await rectWrap.boundingBox())!;
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 - 220, rb.y + rb.height / 2, { steps: 6 });
  await page.mouse.up();

  // The padlock lives in the selected object's floating toolbar. The rectangle
  // is selected → its padlock shows, open (unlocked). Tap it to lock.
  await expect(page.getByRole("button", { name: "Unlocked for pupils", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Unlocked for pupils", exact: true }).click();
  await expect(page.getByRole("button", { name: "Locked for pupils", exact: true })).toHaveCount(1);

  // Second shape: a movable piece, left unlocked. Adding it selects the star and
  // deselects the rectangle, so only the star's (open) padlock is on screen now.
  await addShape("Star");
  await expect(page.getByRole("button", { name: "Unlocked for pupils", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Locked for pupils", exact: true })).toHaveCount(0);

  // Save the template to the library.
  await page.locator('button[title="Done"]').click();
  await expect(page.getByText(/2 movable pieces/)).toBeVisible();
  await page.getByRole("button", { name: /Save to library/ }).click();
  // Redirects to the new template's detail page. Exclude the builder URL
  // (/teacher/activities/new) which the id regex would otherwise match.
  await page.waitForURL(
    (u) => /\/teacher\/activities\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"),
  );
  const templateUrl = page.url();

  // --- View it as a pupil (the preview uses the exact child canvas) ---
  await page.goto(`${templateUrl}/preview`);
  // Wait for both objects to hydrate into movable wrappers (async on load).
  const objectWraps = page
    .locator("div.touch-none")
    .filter({ has: page.locator("svg path[stroke]") });
  await expect(objectWraps).toHaveCount(2);
  // A template with objects opens on the Select tool by default, so a pupil can
  // pick objects up straight away (no need to switch tools first).
  await expect(page.locator('button[aria-label="Select"]')).toHaveAttribute("aria-pressed", "true");

  // The locked object is fixed (pointer-events: none); the unlocked one can be
  // grabbed (pointer-events: auto). Exactly one of each.
  const pointerEvents = await page.evaluate(() =>
    [...document.querySelectorAll("div.touch-none")]
      .filter((d) => d.querySelector("svg path[stroke]"))
      .map((d) => getComputedStyle(d).pointerEvents)
      .sort(),
  );
  expect(pointerEvents).toEqual(["auto", "none"]);

  // --- Re-open the template as its author: every object is editable again ---
  await page.goto(`${templateUrl}/edit`);
  await page.getByRole("button", { name: /Edit template/ }).click();
  await expect(objectPaths).toHaveCount(2);
  await page.locator('button[aria-label="Select"]').click();

  // Selecting an object brings up its author toolbar (proving it's editable
  // again), and each object's lock state was preserved: the rectangle (added
  // first) is still locked, the star still unlocked.
  const wraps = page.locator("div.touch-none").filter({ has: page.locator("svg path[stroke]") });
  await wraps.first().click();
  await expect(page.getByRole("button", { name: "Locked for pupils", exact: true })).toHaveCount(1);
  await wraps.nth(1).click();
  await expect(page.getByRole("button", { name: "Unlocked for pupils", exact: true })).toHaveCount(1);
});
