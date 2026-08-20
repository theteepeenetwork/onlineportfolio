import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// A teacher can place objects on a template and choose, per object, whether it
// may be moved: a padlock (open by default) locks it when tapped. A locked
// object is fixed for pupils AND for the teacher who locked it, until they
// unlock it — a padlock you can drag straight through is not a padlock, and
// "locked" meaning two different things on one screen is what made this
// confusing. When the teacher re-opens their own template the lock states are
// as they left them, and unlocking gives everything back.
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

  // The objects drawn on the canvas. Scoped to `svg[data-shape]` — the element
  // the canvas marks as the thing that draws an object — deliberately. A bare
  // "svg path[stroke]" also matches Next's dev-tools overlay, which lives in a
  // shadow root that Playwright's CSS engine pierces and which renders stroked
  // icons while the dev server is compiling (this test passed against a warm
  // server and failed against a cold one — i.e. always, on CI), and it matches
  // the icons in the object's own floating toolbar.
  const objectPaths = page.locator("div.touch-none svg[data-shape] path[stroke]");

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
  await expect(page.getByRole("button", { name: "Unlocked", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Unlocked", exact: true }).click();
  await expect(page.getByRole("button", { name: "Locked in place", exact: true })).toHaveCount(1);

  // It holds the teacher too. Drag the rectangle hard and it does not budge —
  // and the padlock is still the only control on its toolbar, because
  // everything else there is a way of changing what was just declared fixed.
  const pinned = (await rectWrap.boundingBox())!;
  await page.mouse.move(pinned.x + pinned.width / 2, pinned.y + pinned.height / 2);
  await page.mouse.down();
  await page.mouse.move(pinned.x + pinned.width / 2 + 180, pinned.y + pinned.height / 2 + 90, {
    steps: 6,
  });
  await page.mouse.up();
  const afterDrag = (await rectWrap.boundingBox())!;
  expect(Math.round(afterDrag.x), "a locked object does not move for its author either").toBe(
    Math.round(pinned.x),
  );
  expect(Math.round(afterDrag.y)).toBe(Math.round(pinned.y));
  await expect(page.getByRole("button", { name: "Bring to front" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove object" })).toHaveCount(0);

  // Unlocking hands it all back, which is what makes the lock a lock rather
  // than a one-way door.
  await page.getByRole("button", { name: "Locked in place", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unlocked", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Bring to front" })).toHaveCount(1);
  // Further left, away from where the second shape is about to be added: these
  // two must not overlap, or the clicks at the end of this test land on
  // whichever one happens to be on top.
  await page.mouse.move(pinned.x + pinned.width / 2, pinned.y + pinned.height / 2);
  await page.mouse.down();
  await page.mouse.move(pinned.x + pinned.width / 2 - 60, pinned.y + pinned.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(
    Math.round((await rectWrap.boundingBox())!.x),
    "unlocked, it moves again",
  ).toBeLessThan(Math.round(pinned.x));

  // Lock it again, which is the state the rest of this test is about.
  await page.getByRole("button", { name: "Unlocked", exact: true }).click();
  await expect(page.getByRole("button", { name: "Locked in place", exact: true })).toHaveCount(1);

  // Second shape: a movable piece, left unlocked. Adding it selects the star and
  // deselects the rectangle, so only the star's (open) padlock is on screen now.
  await addShape("Star");
  await expect(page.getByRole("button", { name: "Unlocked", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Locked in place", exact: true })).toHaveCount(0);

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
    .filter({ has: page.locator("svg[data-shape]") });
  await expect(objectWraps).toHaveCount(2);
  // A template with objects opens on the Select tool by default, so a pupil can
  // pick objects up straight away (no need to switch tools first).
  await expect(page.locator('button[aria-label="Move"]')).toHaveAttribute("aria-pressed", "true");

  // The locked object is fixed (pointer-events: none); the unlocked one can be
  // grabbed (pointer-events: auto). Exactly one of each.
  const pointerEvents = await page.evaluate(() =>
    [...document.querySelectorAll("div.touch-none")]
      .filter((d) => d.querySelector("svg[data-shape]"))
      .map((d) => getComputedStyle(d).pointerEvents)
      .sort(),
  );
  expect(pointerEvents).toEqual(["auto", "none"]);

  // --- Re-open the template as its author: every object is editable again ---
  await page.goto(`${templateUrl}/edit`);
  await page.getByRole("button", { name: /Edit template/ }).click();
  await expect(objectPaths).toHaveCount(2);
  await page.locator('button[aria-label="Move"]').click();

  // Selecting an object brings up its author toolbar (proving it's editable
  // again), and each object's lock state was preserved: the rectangle (added
  // first) is still locked, the star still unlocked.
  const wraps = page.locator("div.touch-none").filter({ has: page.locator("svg[data-shape]") });
  await wraps.first().click();
  await expect(page.getByRole("button", { name: "Locked in place", exact: true })).toHaveCount(1);
  await wraps.nth(1).click();
  await expect(page.getByRole("button", { name: "Unlocked", exact: true })).toHaveCount(1);
});
