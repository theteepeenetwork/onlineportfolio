import { test, expect, type Page } from "@playwright/test";
import { studentLogin, openDrawing } from "./helpers";

// Turning something, and being able to turn it at all.
//
// Two things are asserted here and they were one piece of work.
//
// **The step is the object's, not the canvas's.** It used to be a flat 15° for
// everything, and a flat step is the bug: rotation is judged by how far the far
// end of a thing travels, not by degrees. One step of θ moves each end along a
// chord of `L·sin(θ/2)`, so 15° moves a 120-unit counter's edge 16 model units
// and a 420-unit line's ends 55 — 5.5% of the page, every step. That is why a
// long line "jumps like 45 degrees" when the constant says 15: a 15° step on
// the Line preset moves its ends as far as a 54° step on a counter. It matters
// most on a line, where turning is the ONLY way to aim it (its box IS the line,
// so resizing locks the aspect ratio), so at a flat 15° the product could draw
// a line at twelve angles and no others. Working: docs/rotation-findings.md.
//
// **And it can be done from a keyboard.** Both corner handles were
// `<div role="button">` carrying pointer handlers and nothing else — announced
// as buttons, operable by no key, and the only route to turning or resizing
// anything in the product (F50). No gate caught it because without `tabIndex`
// nothing could tab to them to fail on them.

/** The angle the object is actually drawn at, read off its transform. */
async function rotationOf(page: Page): Promise<number> {
  return page.locator("div[data-object]").first().evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (!t || t === "none") return 0;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    const [a, b] = m[1].split(",").map(Number);
    return Math.round(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360);
  });
}

/** Place one shape from the child's palette; it arrives selected. */
async function placeShape(page: Page, name: string) {
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await page.locator('button[aria-label="Move"]').click();
  await expect(page.getByRole("button", { name: "Remove object" })).toBeVisible();
}

test.describe("Turning is sized to the thing being turned", () => {
  test("a long line turns in fine steps, and a right angle is still exact", async ({ page }) => {
    await studentLogin(page, "Dev");
    await openDrawing(page);

    // The Line preset is 420×4 — the object the whole finding is about.
    await placeShape(page, "Line");
    const turn = page.locator('div[title="Turn"]');
    await expect(turn).toBeVisible();
    await turn.focus();

    expect(await rotationOf(page), "a shape is placed upright").toBe(0);
    await page.keyboard.press("ArrowRight");
    // 3°, not 15. The exact number matters as much as the direction: every rung
    // of the ladder divides 45 and 90, so a finer step is a superset of the
    // coarse one rather than a different grid.
    expect(await rotationOf(page), "a long line gets a fine step").toBe(3);

    // Thirty of them is a right angle, exactly — not 89, not 91. This is what
    // the old flat 15 was protecting and what the ladder had to keep.
    for (let i = 0; i < 29; i++) await page.keyboard.press("ArrowRight");
    expect(await rotationOf(page), "square must still be exactly square").toBe(90);
  });

  test("the bigger the object, the finer its step", async ({ page }) => {
    await studentLogin(page, "Dev");
    await openDrawing(page);

    // A rectangle arrives 320×220 — a 388-unit diagonal, so one band up from
    // the finest.
    await placeShape(page, "Rectangle");
    const turn = page.locator('div[title="Turn"]');
    await turn.focus();
    await page.keyboard.press("ArrowRight");
    expect(await rotationOf(page)).toBe(3);
    await page.keyboard.press("ArrowLeft");

    // Grow it past 500 units across and the step gets finer again, because its
    // corners now travel further for the same angle.
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Make it bigger" }).click();
    }
    await turn.focus();
    await page.keyboard.press("ArrowRight");
    expect(await rotationOf(page), "a bigger object earns a finer step").toBe(1);
  });
});

test.describe("The canvas can be driven without a mouse", () => {
  // The specification for this test is F50 itself: nothing in the battery
  // asserted that a control announced as a button could be pressed, which is
  // exactly how two of them shipped that could not be.
  test("the turn and resize handles are reachable and operable by keyboard", async ({ page }) => {
    await studentLogin(page, "Dev");
    await openDrawing(page);
    await placeShape(page, "Rectangle");

    const turn = page.locator('div[title="Turn"]');
    const resize = page.locator('div[title="Resize"]');

    // Announced as buttons — and now actually in the tab order, which is the
    // half that was missing.
    for (const handle of [turn, resize]) {
      await expect(handle).toHaveAttribute("role", "button");
      await expect(handle, "a control that says it is a button must be focusable").toHaveAttribute(
        "tabindex",
        "0",
      );
    }

    await turn.focus();
    await expect(turn).toBeFocused();
    const upright = await rotationOf(page);
    await page.keyboard.press("ArrowRight");
    expect(
      await rotationOf(page),
      "the keyboard must actually turn it, not merely focus it",
    ).not.toBe(upright);
    // And back the other way, so a child is not made to go the long way round.
    await page.keyboard.press("ArrowLeft");
    expect(await rotationOf(page)).toBe(upright);

    // Resizing, the same way.
    const shape = page.locator("div[data-object]").first();
    const before = (await shape.boundingBox())!;
    await resize.focus();
    await expect(resize).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const bigger = (await shape.boundingBox())!;
    expect(bigger.width, "the keyboard must actually resize it").toBeGreaterThan(before.width);
    await page.keyboard.press("ArrowLeft");
    expect((await shape.boundingBox())!.width).toBeLessThan(bigger.width);
  });

  test("turn and resize are also real buttons, where a child looks for them", async ({ page }) => {
    await studentLogin(page, "Dev");
    await openDrawing(page);
    await placeShape(page, "Rectangle");

    // The toolbar keeps the coarse 15°, deliberately: this is the control for
    // squaring something up, and pressing it thirty times to reach a right
    // angle on a long line would be its own bad screen. The fine path is the
    // handle above.
    const right = page.getByRole("button", { name: "Turn right" });
    await expect(right).toBeVisible();
    const box = (await right.boundingBox())!;
    expect(
      Math.min(box.width, box.height),
      "a child taps this (SAFEGUARDING rule 18)",
    ).toBeGreaterThanOrEqual(64);

    await right.click();
    expect(await rotationOf(page)).toBe(15);
    await page.getByRole("button", { name: "Turn left" }).click();
    expect(await rotationOf(page)).toBe(0);

    const shape = page.locator("div[data-object]").first();
    const before = (await shape.boundingBox())!;
    await page.getByRole("button", { name: "Make it bigger" }).click();
    expect((await shape.boundingBox())!.width).toBeGreaterThan(before.width);
    await page.getByRole("button", { name: "Make it smaller" }).click();
    expect((await shape.boundingBox())!.width).toBeCloseTo(before.width, 0);
  });
});
