import { test, expect } from "@playwright/test";
import { studentLogin, openDrawing, teacherLogin } from "./helpers";

// Shapes can be added, are movable / resizable, and their fill + line colour
// can be changed.
test("a child can add a shape, recolour it, move and resize it", async ({ page }) => {
  // Ella has no seeded or other-test work, so "Waiting for you" is unambiguous.
  await studentLogin(page, "Ella");
  await openDrawing(page);

  // Open the ＋ fan → Shapes → add a rectangle.
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();

  const shape = page.locator("svg path[stroke]").first();
  await expect(shape).toBeVisible();

  // Change fill + line colour via the object bar. Each opens a row of swatches
  // with the any-colour input at its end; the input carries the same name.
  await page.getByRole("button", { name: "Fill colour" }).click();
  await page.locator('input[aria-label="Fill colour"]').fill("#ef4444");
  await page.getByRole("button", { name: "Line colour" }).click();
  await page.locator('input[aria-label="Line colour"]').fill("#10b981");
  await expect(shape).toHaveAttribute("fill", "#ef4444");
  await expect(shape).toHaveAttribute("stroke", "#10b981");

  // Move it and resize it.
  const wrapper = shape.locator("xpath=ancestor::div[1]");
  const before = (await wrapper.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 - 100, before.y + before.height / 2 - 60, {
    steps: 6,
  });
  await page.mouse.up();
  const afterMove = (await wrapper.boundingBox())!;
  expect(afterMove.x).toBeLessThan(before.x - 30);

  const handle = page.locator('div[title="Resize"]');
  const hb = (await handle.boundingBox())!;
  const widthBefore = afterMove.width;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 80, hb.y + 80, { steps: 6 });
  await page.mouse.up();
  expect((await wrapper.boundingBox())!.width).toBeGreaterThan(widthBefore + 30);

  // Hand it in — the shape is flattened into the saved image.
  await page.locator('button[title="Done"]').click();
  await page.waitForURL((url) => url.pathname === "/student/popped");
  await page.getByRole("link", { name: /Back to my jar/ }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByText(/Waiting for your teacher/)).toBeVisible();
});

// The first shape arrives bright blue whatever pen is in hand, and once a
// shape has been recoloured the next one arrives in that colour. A fresh
// canvas starts blue again.
test("a new shape takes the colour the last one was given, and a new canvas starts blue", async ({ page }) => {
  await studentLogin(page, "Ella");
  await openDrawing(page);

  const addRect = async () => {
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name: "Rectangle" }).click();
  };

  await addRect();
  const shapes = page.locator("div[data-object] svg path[stroke]");
  await expect(shapes.nth(0)).toHaveAttribute("fill", "#3b82f6");

  await page.getByRole("button", { name: "Fill colour" }).click();
  await page.locator('input[aria-label="Fill colour"]').fill("#ef4444");
  await expect(shapes.nth(0)).toHaveAttribute("fill", "#ef4444");

  await addRect();
  await expect(shapes.nth(1)).toHaveAttribute("fill", "#ef4444");

  // A fresh canvas forgets it.
  await page.reload();
  const restore = page.getByRole("button", { name: /Start fresh/i });
  if (await restore.isVisible({ timeout: 3000 }).catch(() => false)) await restore.click();
  await addRect();
  await expect(page.locator("div[data-object] svg path[stroke]").last()).toHaveAttribute("fill", "#3b82f6");
});

// Pentagon, hexagon, octagon — and everything between and beyond.
//
// One kind with one number, not three kinds: they differ by a side count, so
// the count is a control. That is the same argument the grid makes for fronting
// the ten rod, the hundred flat and the fraction bar, and it is why a heptagon
// needs no button.
test("the polygons are one shape with a number, so any of them can be reached", async ({
  page,
}) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Polygons");
  await page.getByRole("button", { name: /Build a template/ }).click();

  const place = async (name: string) => {
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name, exact: true }).click();
  };
  const corners = async () => {
    const d = (await page.locator('svg[data-shape="polygon"] path').first().getAttribute("d"))!;
    return (d.match(/[ML] /g) ?? []).length;
  };

  await place("Pentagon");
  expect(await corners()).toBe(5);
  await page.getByRole("button", { name: "Remove object" }).click();

  await place("Hexagon");
  expect(await corners()).toBe(6);
  await page.getByRole("button", { name: "Remove object" }).click();

  await place("Octagon");
  expect(await corners()).toBe(8);

  // A heptagon: no button offers one, and one is two taps away.
  await page.getByRole("button", { name: "Sides: fewer" }).click();
  expect(await corners()).toBe(7);

  // The count cannot leave the range the geometry can draw: seven down to the
  // floor of three, and then the control says no rather than going further.
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Sides: fewer" }).click();
  }
  expect(await corners()).toBe(3);
  await expect(page.getByRole("button", { name: "Sides: fewer" })).toBeDisabled();
});
