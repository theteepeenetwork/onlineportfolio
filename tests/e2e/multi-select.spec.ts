import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin } from "./helpers";

// Drag-selecting: a box drawn on empty canvas picks up everything it touches,
// and dragging any one of them carries the rest.
//
// Touching rather than enclosing, on purpose. A child drawing a box round six
// counters should not have to get every edge outside every counter, and the
// cost of being generous is a shape they did not want — which one tap on the
// background undoes.

async function clearDrafts() {
  const db = new PrismaClient();
  try {
    for (let i = 0; i < 3; i++) {
      await db.draft.deleteMany({});
      if ((await db.draft.count()) === 0) break;
    }
  } finally {
    await db.$disconnect();
  }
}
test.beforeEach(clearDrafts);
test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
  await clearDrafts();
});

type Placed = { id?: string; x: number; y: number };
const boxes = (page: Page): Promise<Placed[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll("div[data-object]")].map((e) => {
      const r = e.getBoundingClientRect();
      return { id: (e as HTMLElement).dataset.id, x: Math.round(r.x), y: Math.round(r.y) };
    }),
  );

const ringed = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("div[data-object]")].filter((e) =>
        e.className.includes("ring-brand"),
      ).length,
  );

// Three shapes, spread far enough apart that a band can take some and leave
// others.
async function threeShapes(page: Page) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Many at once");
  await page.getByRole("button", { name: /Build a template/ }).click();
  for (const [name, dx, dy] of [
    ["Rectangle", -280, -150],
    ["Circle", 0, 0],
    ["Star", 280, 150],
  ] as const) {
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    const b = (await page.locator("div[data-object]").last().boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 6 });
    await page.mouse.up();
  }
  await expect(page.locator("div[data-object]")).toHaveCount(3);
}

async function band(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 10 });
  await page.mouse.up();
}

test("a band drawn round several objects picks them all up, and they move as one", async ({
  page,
}) => {
  await threeShapes(page);
  const stage = (await page.locator("canvas").first().boundingBox())!;
  const before = await boxes(page);

  await band(
    page,
    [stage.x + 4, stage.y + 4],
    [stage.x + stage.width - 4, stage.y + stage.height - 4],
  );
  expect(await ringed(page)).toBe(3);

  // Drag one of them; the other two come too, by exactly the same amount.
  const b = (await page.locator("div[data-object]").first().boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 90, b.y + b.height / 2 + 60, { steps: 8 });
  await page.mouse.up();

  const after = await boxes(page);
  const moves = after.map((a, i) => ({ dx: a.x - before[i].x, dy: a.y - before[i].y }));
  // Within a pixel of each other: the move is applied in model units and each
  // object lands on its own sub-pixel boundary once scaled to the screen.
  for (const m of moves) {
    const note = `each object moves by the same amount: ${JSON.stringify(moves)}`;
    expect(Math.abs(m.dx - moves[0].dx), note).toBeLessThanOrEqual(1);
    expect(Math.abs(m.dy - moves[0].dy), note).toBeLessThanOrEqual(1);
  }
  // And it actually moved, so an all-zero result cannot pass the test above.
  expect(Math.abs(moves[0].dx)).toBeGreaterThan(40);
});

test("a band takes only what it touches, and a tap on the background lets go", async ({ page }) => {
  await threeShapes(page);
  const stage = (await page.locator("canvas").first().boundingBox())!;

  // The top-left quarter: the rectangle and the circle, not the star.
  await band(
    page,
    [stage.x + 2, stage.y + 2],
    [stage.x + stage.width * 0.55, stage.y + stage.height * 0.62],
  );
  expect(await ringed(page)).toBe(2);

  // A tap on empty canvas is not a band, and clears the selection.
  await page.mouse.click(stage.x + stage.width - 10, stage.y + stage.height - 10);
  expect(await ringed(page)).toBe(0);
});

test("deleting one of a band deletes the band", async ({ page }) => {
  await threeShapes(page);
  const stage = (await page.locator("canvas").first().boundingBox())!;
  await band(
    page,
    [stage.x + 4, stage.y + 4],
    [stage.x + stage.width - 4, stage.y + stage.height - 4],
  );
  expect(await ringed(page)).toBe(3);

  // They were picked out together, so a child who drew a box round three things
  // and pressed ✕ meant all three.
  await page.locator("div[data-object]").first().click();
  await page.getByRole("button", { name: "Remove object" }).click();
  await expect(page.locator("div[data-object]")).toHaveCount(0);
});
