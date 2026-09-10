import { test, expect, type Page } from "@playwright/test";
import { studentLogin, openDrawing, drawOnCanvas } from "./helpers";

// Undo has to put the DRAWING back, not just the shapes.
//
// The canvas keeps a page as two things: a stroke layer (the pen) and a list of
// objects (shapes, pictures, words). A history step holds both. To stop it
// holding a second copy of pixels it already has, an object-only step now
// re-uses the stroke layer string the page is already stored as, instead of
// encoding the canvas again — which is only correct while that stored string is
// genuinely up to date.
//
// This is the test that notices when it is not. If the stroke layer is ever
// left stale, a child who draws, adds a shape and then presses Undo twice gets
// their drawing thrown away with the shape, and nothing else in the suite would
// say so.

// The page images as the form would post them.
async function pages(page: Page): Promise<string[]> {
  const raw = (await page.locator('input[name="drawingPages"]').inputValue()) || "[]";
  return JSON.parse(raw) as string[];
}

// Page 1's image, once it has stopped moving.
//
// Undo repaints the stroke layer by loading it as an image, so the page's own
// picture is rewritten a moment AFTER the shape leaves the screen. Reading it
// on the click reads the state before the undo landed, which looks exactly like
// a failure and is not one. So: wait for two identical reads in a row, and —
// when the caller can say what the page looked like before — for a value that
// is no longer that. Both, because either alone can be satisfied by a canvas
// that has not started yet.
async function settled(page: Page, changedFrom?: string): Promise<string> {
  let last = "";
  let stable = "";
  await expect
    .poll(
      async () => {
        const now = (await pages(page))[0] ?? "";
        const done = now !== "" && now === last && now !== changedFrom;
        last = now;
        if (done) stable = now;
        return done;
      },
      { intervals: [200, 200, 200, 200, 400, 400, 800] },
    )
    .toBe(true);
  return stable;
}

async function addShape(page: Page, name: string) {
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("undo gives back the drawing under a shape, not just the shape", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  // A page nobody has touched posts nothing at all, so the baseline has to be a
  // page that has been through the canvas once: put a shape down and take it
  // away again. What is left is white paper, which is what two undos must come
  // back to.
  await addShape(page, "Line");
  await expect(page.locator("div[data-object]")).toHaveCount(1);
  const withShape = await settled(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("div[data-object]")).toHaveCount(0);
  const blank = await settled(page, withShape);
  expect(blank).toMatch(/^data:image\/png/);

  // Now: draw, then put a shape on top of the drawing.
  await drawOnCanvas(page);
  const drawn = await settled(page, blank);

  await addShape(page, "Line");
  await expect(page.locator("div[data-object]")).toHaveCount(1);
  const drawnPlusShape = await settled(page, drawn);

  // One undo takes the shape off. The drawing must still be there — this is the
  // assertion that fails if the shape's history step captured a stale, blank
  // stroke layer instead of the one the child had just drawn.
  //
  // "Not the white page" rather than "exactly the bytes from before": a stroke
  // layer that has been through a PNG and back is the same drawing, but the
  // edges of a line are half-transparent and survive that round trip only to
  // rounding. A regression here does not leave some of the drawing — it leaves
  // none of it.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("div[data-object]")).toHaveCount(0);
  const shapeUndone = await settled(page, drawnPlusShape);
  expect(shapeUndone).not.toBe(blank);

  // The second undo takes the drawing off, back to the white page.
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await settled(page, shapeUndone)).toBe(blank);

  // And redo brings the drawing back, so undo is a step and not a delete.
  await page.getByRole("button", { name: "Redo" }).click();
  expect(await settled(page, blank)).not.toBe(blank);
});
