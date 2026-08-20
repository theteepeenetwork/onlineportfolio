import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// The object toolbar hovers above a selected object, but must drop BELOW it when
// the object is near the top edge, so it never clips off the top of the canvas.
test("the object toolbar flips below the object near the top edge (never clipped)", async ({
  page,
}) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: /Build a template/ }).click();

  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Star" }).click();

  // The stage box (with overflow-hidden) is what would clip the toolbar.
  const stage = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".overflow-hidden")].find((e) =>
      e.querySelector("canvas"),
    )!;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, w: r.width };
  });

  // Drag the object right up to the top edge of the canvas.
  const wrap = page
    .locator("div.touch-none")
    .filter({ has: page.locator("svg path[stroke]") })
    .first();
  const b = (await wrap.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(stage.left + stage.w / 2, stage.top + 25, { steps: 8 });
  await page.mouse.up();

  // The toolbar has flipped below the object AND stays within the canvas box.
  const fit = await page.evaluate(() => {
    const bar = document.querySelector('button[aria-label="Send to back"]')?.closest("div");
    const box = bar?.closest(".overflow-hidden");
    if (!bar || !box) return null;
    const b = bar.getBoundingClientRect();
    const s = box.getBoundingClientRect();
    return {
      below: bar.className.includes("top-full"),
      withinTop: b.top >= s.top - 0.5,
    };
  });
  expect(fit).not.toBeNull();
  expect(fit!.below).toBe(true);
  expect(fit!.withinTop).toBe(true);
});

// The toolbar is centred over the object, but must stay within the canvas at the
// left/right edges rather than clipping off the side.
test("the object toolbar stays within the canvas at the side edges", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: /Build a template/ }).click();

  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click(); // widest toolbar (fill + line)

  const wrap = page
    .locator("div.touch-none")
    .filter({ has: page.locator("svg path[stroke]") })
    .first();

  // The inner canvas box (the overflow-hidden element that would clip the bar).
  const box = await wrap.evaluate((el) => {
    const s = (el.closest(".overflow-hidden") as HTMLElement).getBoundingClientRect();
    return { left: s.left, right: s.right, top: s.top, h: s.height };
  });

  const dragCentreTo = async (x: number) => {
    const b = (await wrap.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, box.top + box.h / 2, { steps: 8 });
    await page.mouse.up();
  };

  const within = () =>
    page.evaluate(() => {
      const bar = document.querySelector('button[aria-label="Send to back"]')!.closest("div")!;
      const s = bar.closest(".overflow-hidden")!.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return b.left >= s.left - 0.5 && b.right <= s.right + 0.5;
    });

  // Jam the object against the right edge, then the left edge.
  await dragCentreTo(box.right - 4);
  expect(await within()).toBe(true);
  await dragCentreTo(box.left + 4);
  expect(await within()).toBe(true);
});

// Each corner control on its OWN corner, asserted by measurement.
//
// They shipped once with the two top controls hanging below the object: their
// offsets came from Tailwind's `-top-8`, a utility class that only exists if
// the CSS build has seen it, and `-bottom-8` was already in the app while
// `-top-8` was new — so a stale chunk left `top: auto` and dropped them into
// normal flow. Horizontally right, vertically wrong, and nothing failed. The
// offsets are inline now, and this measures where they actually land.
test("each corner control sits on its own corner", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Corners");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Circle" }).click();

  const wrap = page.locator("div[data-object]").first();
  const box = (await wrap.boundingBox())!;
  const centre = async (name: string) => {
    const b = (await page.locator(`[aria-label="${name}"]`).first().boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const near = (a: number, b: number) => Math.abs(a - b) <= 2;

  for (const [name, corner] of [
    ["Edit text", { x: box.x, y: box.y }],
    ["Remove object", { x: box.x + box.width, y: box.y }],
    ["Turn shape", { x: box.x, y: box.y + box.height }],
    ["Resize shape", { x: box.x + box.width, y: box.y + box.height }],
  ] as const) {
    const c = await centre(name);
    expect(
      near(c.x, corner.x) && near(c.y, corner.y),
      `${name} should be centred on its corner — wanted ${JSON.stringify(corner)}, got ${JSON.stringify(c)}`,
    ).toBe(true);
  }
});
