import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin } from "./helpers";

// Typing a number in, and the clipboard — by keyboard and by right click.
//
// All of it exists because the canvas was quick once you knew it and slow the
// first time: fifty taps to count in fifties, no ⌘C, and a duplicate button
// that only appears once something is already selected.

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

async function builder(page: Page, title: string) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", title);
  await page.getByRole("button", { name: /Build a template/ }).click();
}

async function numberLine(page: Page) {
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Maths kit" }).click();
  await page.getByRole("button", { name: "Number line", exact: true }).click();
}

async function rectangle(page: Page) {
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
}

// --- Typing a number --------------------------------------------------------

test("a stepper's number can be typed straight in", async ({ page }) => {
  await builder(page, "Typing");
  await numberLine(page);
  const svg = page.locator('svg[data-shape="numberline"]');
  const interval = page.getByRole("textbox", { name: "Interval" });

  // Counting in fifties is an ordinary Year 2 lesson and fifty taps on + is
  // not a control, it is an obstacle.
  await interval.fill("50");
  await interval.press("Enter");
  await expect(svg.locator("text").nth(1)).toHaveText("50");
  await expect(svg.locator("text").last()).toHaveText("500");

  // A value the geometry cannot draw is clamped to the bound the buttons
  // already respect, not accepted.
  await interval.fill("9999");
  await interval.press("Enter");
  await expect(interval).toHaveValue("100");

  // Escape abandons what was typed.
  await interval.fill("7");
  await interval.press("Escape");
  await expect(interval).toHaveValue("100");

  // And the buttons still work, because most numbers here are small ones.
  await page.getByRole("button", { name: "Interval: fewer" }).click();
  await expect(interval).toHaveValue("99");
});

// --- The keyboard -----------------------------------------------------------

test("copy, paste, cut and delete work from the keyboard", async ({ page }) => {
  await builder(page, "Keys");
  await rectangle(page);
  const objects = page.locator("div[data-object]");
  await expect(objects).toHaveCount(1);
  const first = (await objects.first().boundingBox())!;

  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(objects).toHaveCount(2);
  // Offset, so it reads as a second thing rather than looking like nothing
  // happened.
  const second = (await objects.last().boundingBox())!;
  expect(second.x).toBeGreaterThan(first.x);
  expect(second.y).toBeGreaterThan(first.y);

  // Backspace deletes what is selected — the pasted one.
  await page.keyboard.press("Backspace");
  await expect(objects).toHaveCount(1);

  // Cut takes it away and paste brings it back.
  await objects.first().click();
  await page.keyboard.press("ControlOrMeta+x");
  await expect(objects).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+v");
  await expect(objects).toHaveCount(1);
});

test("the shortcuts keep out of the way of anything being typed into", async ({ page }) => {
  // The regression that would make the new number field unusable: Backspace
  // over a typo deleting the shape instead of a digit.
  await builder(page, "Guards");
  await numberLine(page);
  const objects = page.locator("div[data-object]");
  const interval = page.getByRole("textbox", { name: "Interval" });

  await interval.click();
  await interval.press("Backspace");
  await expect(objects, "Backspace in the number field must not delete the object").toHaveCount(1);

  // Same for a text box being written in.
  const cbox = (await page.locator("canvas").first().boundingBox())!;
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(cbox.x + cbox.width * 0.3, cbox.y + cbox.height * 0.75);
  await page.locator('textarea[placeholder="Type…"]').waitFor();
  await page.keyboard.type("hello");
  await page.keyboard.press("Backspace");
  await expect(page.locator('textarea[placeholder="Type…"]')).toHaveValue("hell");
  await expect(objects, "Backspace while writing must not delete anything").toHaveCount(2);
});

// --- The right-click menu ---------------------------------------------------

async function rightClick(page: Page, target: { x: number; y: number; width: number; height: number }) {
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2, {
    button: "right",
  });
}

test("right-clicking an object offers cut, copy, paste, duplicate and delete", async ({ page }) => {
  await builder(page, "Menu");
  await rectangle(page);
  const objects = page.locator("div[data-object]");

  await rightClick(page, (await objects.first().boundingBox())!);
  await expect(page.getByRole("menuitem")).toHaveText([
    "Cut",
    "Copy",
    "Paste",
    "Duplicate",
    "Delete",
  ]);
  // Nothing copied yet, so there is nothing to paste.
  await expect(page.getByRole("menuitem", { name: "Paste" })).toBeDisabled();

  // Escape closes it, as Escape closes everything in this app.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);

  await rightClick(page, (await objects.first().boundingBox())!);
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(objects).toHaveCount(2);
});

test("right-clicking one of a marquee group acts on the group", async ({ page }) => {
  await builder(page, "Group menu");
  for (const [name, dx] of [["Rectangle", -260], ["Circle", 260]] as const) {
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    const b = (await page.locator("div[data-object]").last().boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
  }
  const objects = page.locator("div[data-object]");
  await expect(objects).toHaveCount(2);

  const stage = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.move(stage.x + 4, stage.y + 4);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width - 4, stage.y + stage.height - 4, { steps: 10 });
  await page.mouse.up();

  // The wording says so, and then it does so.
  await rightClick(page, (await objects.first().boundingBox())!);
  await expect(page.getByRole("menuitem", { name: "Copy these" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete these" }).click();
  await expect(objects).toHaveCount(0);
});

test("right-clicking empty canvas offers paste", async ({ page }) => {
  await builder(page, "Paste menu");
  await rectangle(page);
  await page.keyboard.press("ControlOrMeta+c");

  const stage = (await page.locator("canvas").first().boundingBox())!;
  await page.mouse.click(stage.x + stage.width - 60, stage.y + stage.height - 60, {
    button: "right",
  });
  await expect(page.getByRole("menuitem")).toHaveText(["Paste"]);
  await page.getByRole("menuitem", { name: "Paste" }).click();
  await expect(page.locator("div[data-object]")).toHaveCount(2);
});
