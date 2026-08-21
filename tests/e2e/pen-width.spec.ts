import { test, expect, type Page } from "@playwright/test";
import { teacherLogin } from "./helpers";

// What a pen is set to, and where a child finds it.
//
// The line width used to be buried inside the colour pop-up, then behind a
// button under a 460px vertical rainbow. The rainbow could reach any hue, which
// sounds generous until you watch it used: every colour on it was fully
// saturated, so black, white and grey were unreachable, and picking a
// particular colour meant dragging a 24px target and watching a preview. Both
// are now a bar that sits above the pens and says what the choice is.

async function penInHand(page: Page) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas").first()).toBeVisible();
  // The builder opens on Move; the bar is for the tools that draw.
  await page.locator('button[aria-label="Pen"]').click();
}

test("colour and thickness are on screen the moment a pen is in hand", async ({ page }) => {
  await penInHand(page);
  // No hunting, no pop-up: the choices are the control.
  await expect(page.getByRole("button", { name: "Colour #ef4444" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thickness 22" })).toBeVisible();
  // Including the colours the old rainbow could not reach at all.
  await expect(page.getByRole("button", { name: "Colour #1f2430" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Colour #ffffff" })).toBeVisible();
});

test("thickness sticks to the tool it was set on", async ({ page }) => {
  await penInHand(page);
  await page.getByRole("button", { name: "Thickness 22" }).click();
  await expect(page.getByRole("button", { name: "Thickness 22" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Each tool keeps its own, so reaching for the highlighter does not undo what
  // the pen was set to.
  await page.locator('button[aria-label="Highlighter"]').click();
  await expect(page.getByRole("button", { name: "Thickness 22" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.locator('button[aria-label="Pen"]').click();
  await expect(page.getByRole("button", { name: "Thickness 22" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the rubber is offered a thickness but not a colour", async ({ page }) => {
  await penInHand(page);
  await expect(page.getByRole("button", { name: /^Colour /})).not.toHaveCount(0);

  await page.locator('button[aria-label="Eraser"]').click();
  // An eraser has no colour, so offering one would be offering a choice that
  // does nothing.
  await expect(page.getByRole("button", { name: /^Colour /})).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thickness 6" })).toBeVisible();
});

test("the bar comes with the pen and goes when the page is touched", async ({ page }) => {
  // It floats over the page, so it cannot be a thing that sits there. Two
  // earlier attempts were worse: leaving it up permanently covered a quiz
  // answer a child then could not tap, and folding it to a pill left a button
  // on the page that did not say what it was for.
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  const swatch = page.getByRole("button", { name: "Colour #ef4444" });
  // Nothing at rest — no bar, and nothing left in its place either.
  await expect(swatch).toHaveCount(0);
  await expect(page.getByRole("button", { name: /how thick/i })).toHaveCount(0);

  await page.locator('button[aria-label="Pen"]').click();
  await expect(swatch).toBeVisible();

  // Touching the page puts it away and leaves nothing behind.
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.25);
  await expect(swatch).toHaveCount(0);
  await expect(page.getByRole("button", { name: /how thick/i })).toHaveCount(0);

  // Reaching for the same pen again brings it back.
  await page.locator('button[aria-label="Pen"]').click();
  await expect(swatch).toBeVisible();
});

test("the bar is not there while things are being moved", async ({ page }) => {
  // It sits over the bottom of the canvas, which is where the corner controls
  // of anything placed down there are. With the Move tool in hand it swallowed
  // the resize handle of a shape near the foot of the page.
  await penInHand(page);
  await expect(page.getByRole("button", { name: "Thickness 6" })).toBeVisible();
  await page.locator('button[aria-label="Move"]').click();
  await expect(page.getByRole("button", { name: "Thickness 6" })).toHaveCount(0);
});

test("colour and thickness are reachable with the keyboard alone", async ({ page }) => {
  await penInHand(page);
  // Plain buttons, so they focus and fire without a pointer — which the hue bar
  // needed a hand-rolled arrow-key handler to manage.
  const red = page.getByRole("button", { name: "Colour #ef4444" });
  await red.focus();
  await expect(red).toBeFocused();
  await red.press("Enter");
  await expect(red).toHaveAttribute("aria-pressed", "true");

  const thick = page.getByRole("button", { name: "Thickness 22" });
  await thick.focus();
  await thick.press("Enter");
  await expect(thick).toHaveAttribute("aria-pressed", "true");
});

test("drawing still works with the bar on screen", async ({ page }) => {
  await penInHand(page);
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  // Well clear of the bar, which sits just above the pens.
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 8 });
  await page.mouse.up();
  // Something was drawn: the page is no longer blank.
  const drawn = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
    return false;
  });
  expect(drawn).toBe(true);
});
