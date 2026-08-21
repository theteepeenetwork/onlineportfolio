import { test, expect } from "@playwright/test";
import { teacherLogin, turnObject } from "./helpers";

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
  // Asserted by measurement rather than by class name: the toolbar is placed
  // from the object's turned box now, so which side it is on is a number, not a
  // `top-full` / `bottom-full` utility.
  const fit = await page.evaluate(() => {
    const bar = document.querySelector('button[aria-label="Send to back"]')?.closest("div");
    const box = bar?.closest(".overflow-hidden");
    const obj = document.querySelector("div[data-object]");
    if (!bar || !box || !obj) return null;
    const b = bar.getBoundingClientRect();
    const s = box.getBoundingClientRect();
    const o = obj.getBoundingClientRect();
    return {
      below: b.top >= o.bottom - 0.5,
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

// ===========================================================================
// A turned object's controls must still be PRESSABLE.
//
// The corner controls were positioned correctly and still could not be used.
// The toolbar was a child of the object wrapper, so it was anchored to the
// unturned top edge while rotation carried the controls around an arc that
// reached above it — and the toolbar, being z-30 against controls with no
// z-index at all, both hid the delete button and swallowed the tap. At 180° the
// "above" toolbar landed under the shape, on the turn and resize controls.
//
// The test that existed asked where each control WAS. This asks whether a
// finger put there reaches it, which is the thing that broke.

const CORNERS = ["Edit text", "Remove object", "Turn shape", "Resize shape"] as const;

// What a tap at the centre of each control would actually hit.
async function reachable(page: import("@playwright/test").Page, labels: readonly string[]) {
  return page.evaluate((names) => {
    return names.map((name) => {
      const el = document.querySelector(`[aria-label="${name}"]`);
      if (!el) return { name, ok: false, hit: "missing" };
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      // The press is a box around a small dot, so the point may land on the dot
      // or its icon — anywhere inside the control counts. Anything else does
      // not, and in practice "anything else" was the toolbar.
      const ok = !!top && el.contains(top);
      const hit = top
        ? (top.closest("[aria-label]")?.getAttribute("aria-label") ?? top.tagName.toLowerCase())
        : "nothing";
      return { name, ok, hit };
    });
  }, labels);
}

test("every corner control of a turned shape can still be pressed", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Turned");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();

  // Upright first: the toolbar used to sit over the top 20px of both top
  // presses even before anything was turned.
  for (const c of await reachable(page, CORNERS)) {
    expect(c.ok, `upright: "${c.name}" is covered by "${c.hit}"`).toBe(true);
  }

  // Then round, in the 15° stops the turn handle actually offers. 180° is the
  // one that used to park the toolbar squarely on turn and resize.
  for (const [step, angle] of [
    [15, 15],
    [75, 90],
    [90, 180],
    [90, 270],
  ] as const) {
    await turnObject(page, step);
    for (const c of await reachable(page, CORNERS)) {
      expect(c.ok, `at ${angle}°: "${c.name}" is covered by "${c.hit}"`).toBe(true);
    }
  }
});

test("every corner control of a turned text box can still be pressed", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Turned words");
  await page.getByRole("button", { name: /Build a template/ }).click();

  // Place a text box, type into it, then commit by switching tools and
  // re-select it — the corners only exist on a selected, non-editing box.
  const cbox = (await page.locator("canvas").first().boundingBox())!;
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(cbox.x + cbox.width * 0.45, cbox.y + cbox.height * 0.5);
  await page.locator('textarea[placeholder="Type…"]').waitFor();
  await page.keyboard.type("Hello");
  await page.locator('button[title="Pen"]').click();
  await page.locator('button[aria-label="Move"]').click();
  const label = page.getByText("Hello", { exact: true });
  const lb = (await label.boundingBox())!;
  await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await expect(page.getByRole("button", { name: "Edit text" })).toBeVisible();

  const labels = ["Edit text", "Remove text", "Turn text", "Resize text"];
  for (const [step, angle] of [
    [0, 0],
    [90, 90],
    [90, 180],
  ] as const) {
    if (step) await turnObject(page, step);
    for (const c of await reachable(page, labels)) {
      expect(c.ok, `at ${angle}°: "${c.name}" is covered by "${c.hit}"`).toBe(true);
    }
  }
});

// The toolbar reads left-to-right whatever the object underneath is doing. It
// used to be counter-rotated inside the turning wrapper to achieve that — and
// the text box was never given the counter-rotation, so a turned text box wore
// its toolbar upside down. It is outside the wrapper now, so there is nothing
// to counter and nothing to forget.
test("a turned object's toolbar is not turned with it", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Upright bar");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();

  await turnObject(page, 90);

  const upright = await page.evaluate(() => {
    const bar = document.querySelector('button[aria-label="Send to back"]')?.closest("div");
    if (!bar) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(bar).transform);
    // No rotation at all: the x-axis is still the x-axis. Only translation.
    return { a: Math.round(m.a), b: Math.round(m.b), c: Math.round(m.c), d: Math.round(m.d) };
  });
  expect(upright).toEqual({ a: 1, b: 0, c: 0, d: 1 });
});

// A line laid flat is a box a couple of pixels tall, so its top and bottom
// corners are in nearly the same place. Four 64px presses on four corners that
// close to each other is two controls a child can reach and two they cannot —
// the pencil buried under the turn handle, the ✕ under the resize dot. Below one
// press of separation the controls are pushed apart until there is one.
test("a flat shape's four controls do not pile up on each other", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Flat");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Line", exact: true }).click();

  for (const c of await reachable(page, CORNERS)) {
    expect(c.ok, `"${c.name}" on a flat line is covered by "${c.hit}"`).toBe(true);
  }

  // And the mechanism behind it: no two presses share the same ground.
  const centres = await page.evaluate((names) => {
    return names.map((name) => {
      const r = document.querySelector(`[aria-label="${name}"]`)!.getBoundingClientRect();
      return { name, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
  }, CORNERS as unknown as string[]);
  for (let i = 0; i < centres.length; i++) {
    for (let j = i + 1; j < centres.length; j++) {
      const gap = Math.hypot(centres[i].x - centres[j].x, centres[i].y - centres[j].y);
      expect(gap, `"${centres[i].name}" and "${centres[j].name}" are ${Math.round(gap)}px apart`)
        .toBeGreaterThanOrEqual(56);
    }
  }
});

// One menu at a time.
//
// The properties toolbar hovers over its object; the add menu and its palette
// sit down the left. Open together they overlap, and a teacher is left with two
// sets of controls stacked on each other and no way to tell which one a tap
// will reach. It happened either way round, so this checks both.
test("opening one menu closes the other", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Menus");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();

  // Selected: the properties toolbar is up.
  await expect(page.getByRole("button", { name: "Send to back" })).toBeVisible();

  // Open the add menu -> the properties toolbar goes.
  await page.locator('button[title="Add"]').click();
  await expect(page.getByRole("button", { name: "Send to back" })).toHaveCount(0);

  // Open a palette, then tap the object -> the palette goes. The maths kit,
  // because a one-group kit renders no tabs to look for.
  await page.getByRole("button", { name: "Maths kit" }).click();
  await expect(page.getByRole("tab", { name: "Signs" })).toBeVisible();
  const b = (await page.locator("div[data-object]").first().boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByRole("tab", { name: "Signs" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send to back" })).toBeVisible();
});
