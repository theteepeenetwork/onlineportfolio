import { test, expect, type Page } from "@playwright/test";
import { openPenFan, pickTool, teacherLogin } from "./helpers";

// What a pen is set to, and where a child finds it.
//
// The line width used to be buried inside the colour pop-up, then behind a
// button under a 460px vertical rainbow. The rainbow could reach any hue, which
// sounds generous until you watch it used: every colour on it was fully
// saturated, so black, white and grey were unreachable, and picking a
// particular colour meant dragging a 24px target and watching a preview.
//
// They are now RINGS about the pen disc: nibs nearest the thumb, the tools
// beyond them, the colours furthest out, each on its own coloured band so the
// three groups read before the buttons do. Tapping the disc is what opens them,
// and touching the paper is what folds them away.

async function penInHand(page: Page) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas").first()).toBeVisible();
  // The builder opens on Move; the rings are for the tools that draw.
  await pickTool(page, "Pen");
}

test("colour and thickness are on screen the moment the pens are open", async ({ page }) => {
  await penInHand(page);
  // No hunting, no pop-up: the choices are the control. Picking a tool leaves
  // the fan open, precisely so the next choice is already in front of you.
  await expect(page.getByRole("button", { name: "Colour #bd3f63" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thickness 22" })).toBeVisible();
  // Including the colours the old rainbow could not reach at all. White is not
  // one of the brand ten and rides the outer arc's spare slot anyway, because
  // it is how a child draws on a photograph.
  await expect(page.getByRole("button", { name: "Colour #22304a" })).toBeVisible();
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

  await page.locator('button[aria-label="Rubber"]').click();
  // An eraser has no colour, so offering one would be offering a choice that
  // does nothing.
  await expect(page.getByRole("button", { name: /^Colour /})).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thickness 6" })).toBeVisible();
});

test("the fan comes with the disc and goes when the page is touched", async ({ page }) => {
  // It floats over the page, so it cannot be a thing that sits there. Two
  // earlier attempts were worse: leaving it up permanently covered a quiz
  // answer a child then could not tap, and folding it to a pill left a button
  // on the page that did not say what it was for.
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await expect(page.locator("canvas").first()).toBeVisible();

  const swatch = page.getByRole("button", { name: "Colour #bd3f63" });
  // Nothing at rest — no ring, and nothing left in its place either.
  await expect(swatch).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thickness 22" })).toHaveCount(0);

  await openPenFan(page);
  await expect(swatch).toBeVisible();

  // Touching the page puts it away and leaves nothing behind. The touch is
  // swallowed by the closing, so it draws nothing either.
  const box = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.25);
  await expect(swatch).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thickness 22" })).toHaveCount(0);

  // Reaching for the same disc again brings it back.
  await openPenFan(page);
  await expect(swatch).toBeVisible();
});

test("the fan is not there while things are being moved", async ({ page }) => {
  // It sweeps over the corner of the canvas, which is where the controls of
  // anything placed down there are. Picking Move is picking up a piece, so the
  // fan gets out of the way of the piece.
  await penInHand(page);
  await expect(page.getByRole("button", { name: "Thickness 6" })).toBeVisible();
  // Picking Move folds the fan on its own — no second tap.
  await pickTool(page, "Move");
  await expect(page.getByRole("button", { name: "Thickness 6" })).toHaveCount(0);
});

test("colour and thickness are reachable with the keyboard alone", async ({ page }) => {
  await penInHand(page);
  // Plain buttons, so they focus and fire without a pointer — which the hue bar
  // needed a hand-rolled arrow-key handler to manage.
  const red = page.getByRole("button", { name: "Colour #bd3f63" });
  await red.focus();
  await expect(red).toBeFocused();
  await red.press("Enter");
  await expect(red).toHaveAttribute("aria-pressed", "true");

  const thick = page.getByRole("button", { name: "Thickness 22" });
  await thick.focus();
  await thick.press("Enter");
  await expect(thick).toHaveAttribute("aria-pressed", "true");
});

test("the first touch folds the fan, and the next one draws", async ({ page }) => {
  // While a fan is open the paper is the way OUT of it. A child reaching past
  // an open fan to steady the tablet must not leave a mark doing it — and the
  // very next touch has to draw, or the rule costs them a stroke every time.
  await penInHand(page);
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  const ink = () =>
    canvas.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
      return false;
    });

  const stroke = async () => {
    // Well clear of the fan, which sweeps up the far corner.
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 8 });
    await page.mouse.up();
  };

  await stroke();
  expect(await ink()).toBe(false);
  await expect(page.getByRole("button", { name: "Thickness 22" })).toHaveCount(0);

  await stroke();
  expect(await ink()).toBe(true);
});
