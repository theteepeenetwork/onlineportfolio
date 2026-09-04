import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, logout, demoClassCode, studentLogin, drawOnCanvas } from "./helpers";

// The photo frame: a teacher places a box on a template, and a child fills it
// from the device camera when they do the activity. Teacher-only to place,
// child-only to fill, and the photo is flattened into the handed-in page like
// every other object.
//
// Camera hardware is not a thing a test can assume, so `getUserMedia` is
// replaced before each page loads: a canvas painted a solid colour, streamed
// (see `stubCamera`). The colour is what the hand-in assertion looks for.

// Same housekeeping as infinite-apparatus.spec.ts, for the same reasons: a
// draft left behind raises a modal in the next test, and a PENDING item left
// behind breaks the specs written around a child having exactly one.
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

let startedAt = new Date(0);

test.beforeEach(async () => {
  startedAt = new Date();
  await clearDrafts();
});

test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
  await clearDrafts();
  const db = new PrismaClient();
  try {
    await db.journalItem.deleteMany({ where: { createdAt: { gte: startedAt } } });
  } finally {
    await db.$disconnect();
  }
});

// A fake camera. The stub is installed before any script on the page runs, so
// the hook's `getUserMedia` call gets a real MediaStream — frames of solid
// magenta at ten a second — or, with `fail`, the refusal a locked-down laptop
// gives. Playwright's own fake-device flags would do the same at the config
// level, but a config change selects the whole battery on every PR.
// `cameras` is how many the device reports: 1 (the default) must offer no flip
// button at all, 2 offers one. Every getUserMedia call records the facingMode
// it was asked for on `window.__facing`, which is how the flip is asserted —
// a fake stream looks identical whichever way it claims to point.
function stubCamera(page: Page, opts: { fail?: boolean; cameras?: number } = {}) {
  return page.addInitScript(
    ({ fail, cameras }: { fail: boolean; cameras: number }) => {
      (window as unknown as { __facing: string[] }).__facing = [];
      const getUserMedia = (constraints?: MediaStreamConstraints) => {
        const video = constraints?.video;
        const mode =
          typeof video === "object" && video && "facingMode" in video
            ? String((video as { facingMode?: unknown }).facingMode)
            : "unknown";
        (window as unknown as { __facing: string[] }).__facing.push(mode);
        if (fail) return Promise.reject(new DOMException("denied", "NotAllowedError"));
        const c = document.createElement("canvas");
        c.width = 640;
        c.height = 480;
        const x = c.getContext("2d")!;
        const paint = () => {
          x.fillStyle = "#d946ef";
          x.fillRect(0, 0, 640, 480);
        };
        paint();
        setInterval(paint, 100);
        return Promise.resolve(c.captureStream(10));
      };
      const enumerateDevices = () =>
        Promise.resolve(
          Array.from({ length: cameras }, (_, i) => ({
            kind: "videoinput",
            deviceId: `cam${i}`,
            label: `camera ${i}`,
            groupId: "g",
            toJSON() {
              return {};
            },
          })) as MediaDeviceInfo[],
        );
      const md = navigator.mediaDevices;
      if (md) {
        Object.defineProperty(md, "getUserMedia", { value: getUserMedia, configurable: true });
        Object.defineProperty(md, "enumerateDevices", { value: enumerateDevices, configurable: true });
      } else {
        Object.defineProperty(navigator, "mediaDevices", {
          value: { getUserMedia, enumerateDevices },
          configurable: true,
        });
      }
    },
    { fail: !!opts.fail, cameras: opts.cameras ?? 1 },
  );
}

// The way the camera was asked to point, most recent first-and-only. React
// runs an effect twice in development, so the dialog genuinely calls
// getUserMedia twice on open; the hook's generation guard makes the loser
// silent (see useCameraStream). The LATEST call is therefore the one that
// decides what the child is looking at, and the one worth asserting.
const facingNow = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as { __facing: string[] }).__facing ?? [])).at(-1);

// The child's side of the frame is only reachable with a camera, stubbed or
// real, so its accessibility scan lives here rather than in the a11y battery.
// Same rules and the same F11 baseline as tests/battery/a11y/axe.spec.ts.
const AXE_BASELINE = new Set(["color-contrast", "link-in-text-block"]);
async function expectNoSeriousA11y(page: Page, where: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => (v.impact === "serious" || v.impact === "critical") && !AXE_BASELINE.has(v.id),
  );
  expect(
    blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    `serious a11y violations at ${where}`,
  ).toEqual([]);
}

const addFrame = async (page: Page) => {
  await page.locator('button[title="Add"]').click();
  await page.getByRole("button", { name: "Photo frame" }).click();
};

const frameWrapper = (page: Page) =>
  page.locator("div[data-object]").filter({ has: page.locator("[data-frame]") });

async function buildTemplateWithFrame(page: Page, title: string, prompt?: string) {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", title);
  await page.fill("#instructions", "Take a photo of what you made.");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await addFrame(page);
  await expect(page.locator('div[data-frame="empty"]')).toHaveCount(1);
  if (prompt) {
    await frameWrapper(page).dblclick();
    const box = page.getByPlaceholder("What should they photograph?");
    await expect(box).toBeVisible();
    await box.fill(prompt);
    await box.blur();
    await expect(page.locator("[data-frame]").getByText(prompt)).toBeVisible();
  }
  await page.locator('button[title="Done"]').click();
  await expect(page.getByText(/1 movable piece/)).toBeVisible();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.waitForURL((url) => /^\/teacher\/activities\/(?!new$)[^/]+$/.test(url.pathname));
  const templatePath = new URL(page.url()).pathname;

  await page.getByRole("button", { name: /Assign/ }).first().click();
  await page.getByRole("button", { name: "Sunflower Class" }).click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((url) => url.searchParams.has("run"));
  return templatePath;
}

async function openAsChild(page: Page, title: string) {
  await logout(page);
  await page.goto(`/login/student?code=${await demoClassCode()}`);
  // Finn, as infinite-apparatus.spec.ts explains: other specs rely on Ella and
  // Amara having no other waiting work, and one test here hands work in.
  await page.getByRole("button", { name: "Finn", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("[data-frame]")).toHaveCount(1);
}

// Share of pixels in a region of the handed-in page that are not white. The
// composite is 1000×700 model px and the frame is placed centred at 400×300,
// so it occupies (300,200)-(700,500).
async function darkShare(page: Page, rect: [number, number, number, number]) {
  const raw = await page.locator('input[name="drawingPages"]').inputValue();
  const url = (JSON.parse(raw) as string[])[0];
  return page.evaluate(
    async ({ url, rect }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext("2d")!;
      x.drawImage(img, 0, 0);
      const d = x.getImageData(rect[0], rect[1], rect[2], rect[3]).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) n++;
      }
      return n / (d.length / 4);
    },
    { url, rect },
  );
}

test("a teacher adds, resizes, prompts, saves and removes a photo frame", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.fill("#title", "Frame build");
  await page.getByRole("button", { name: /Build a template/ }).click();
  await addFrame(page);
  const wrap = frameWrapper(page);
  await expect(page.locator('div[data-frame="empty"]')).toHaveCount(1);

  // Selected on placement, with the order and size controls but no padlock,
  // no turn and no fill: a frame is fixed for a child by what it is.
  await expect(page.getByRole("button", { name: "Remove object" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlocked", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Locked in place", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Turn left" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fill colour" })).toHaveCount(0);

  const before = (await wrap.boundingBox())!;
  await page.getByRole("button", { name: "Make it bigger" }).click();
  await page.getByRole("button", { name: "Make it bigger" }).click();
  const bigger = (await wrap.boundingBox())!;
  expect(bigger.width).toBeGreaterThan(before.width);

  // Smaller stops at the floor rather than vanishing.
  for (let i = 0; i < 14; i++) await page.getByRole("button", { name: "Make it smaller" }).click();
  const floorA = (await wrap.boundingBox())!;
  await page.getByRole("button", { name: "Make it smaller" }).click();
  const floorB = (await wrap.boundingBox())!;
  expect(Math.abs(floorA.width - floorB.width)).toBeLessThan(1);
  expect(floorA.width).toBeGreaterThan(60);

  // The teacher's prompt, typed by double-tapping the frame.
  await wrap.dblclick();
  const box = page.getByPlaceholder("What should they photograph?");
  await expect(box).toBeVisible();
  await box.fill("Your model");
  await box.blur();
  await expect(page.locator("[data-frame]").getByText("Your model")).toBeVisible();

  // Survives save and reopen.
  await page.locator('button[title="Done"]').click();
  await expect(page.getByText(/1 movable piece/)).toBeVisible();
  await page.getByRole("button", { name: /Save to library/ }).click();
  await page.waitForURL((url) => /^\/teacher\/activities\/(?!new$)[^/]+$/.test(url.pathname));
  await page.goto(`${new URL(page.url()).pathname}/edit`);
  await page.getByRole("button", { name: /Edit template/ }).click();
  await expect(page.locator("[data-frame]")).toHaveCount(1);
  await expect(page.locator("[data-frame]").getByText("Your model")).toBeVisible();

  // And can be removed.
  await page.locator('button[aria-label="Move"]').click();
  await frameWrapper(page).click();
  await page.getByRole("button", { name: "Remove object" }).click();
  await expect(page.locator("[data-frame]")).toHaveCount(0);
});

test("a child is never offered a photo frame to add", async ({ page }) => {
  await studentLogin(page, "Finn");
  await page.goto("/student/new/drawing");
  await expect(page.locator("canvas")).toBeVisible();
  await page.locator('button[title="Add"]').click();
  await expect(page.getByRole("button", { name: "Shapes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Photo frame" })).toHaveCount(0);
});

test("a child fills the frame under the pen, retakes, draws over it and hands it in", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera"]);
  await stubCamera(page);
  await buildTemplateWithFrame(page, "Frame photo", "Your model");
  await openAsChild(page, "Frame photo");

  // Not offered to add, even on an activity that has one.
  await page.locator('button[title="Add"]').click();
  await expect(page.getByRole("button", { name: "Photo frame" })).toHaveCount(0);
  await page.locator('button[aria-label="Close add menu"]').click();

  // Under the PEN — the tool a child is holding — the frame is still a button,
  // and one at the child touch floor.
  await page.locator('button[title="Pen"]').click();
  const take = page.getByRole("button", { name: "Take a photo" });
  await expect(take).toBeVisible();
  const takeBox = (await take.boundingBox())!;
  expect(takeBox.width).toBeGreaterThanOrEqual(64);
  expect(takeBox.height).toBeGreaterThanOrEqual(64);
  // The teacher's prompt is on the frame, under the button.
  await expect(page.locator("[data-frame]").getByText("Your model")).toBeVisible();
  await expectNoSeriousA11y(page, "child canvas with an empty frame");

  await take.click();
  const dialog = page.getByRole("dialog", { name: "Take a photo" });
  await expect(dialog).toBeVisible();
  await expectNoSeriousA11y(page, "camera dialog");
  const shutter = dialog.getByRole("button", { name: "Take photo" });
  await expect(shutter).toBeEnabled({ timeout: 15_000 });
  await shutter.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('div[data-frame="filled"] img')).toHaveCount(1);

  // Retake: a small button in the frame's corner, still at the floor.
  const again = page.getByRole("button", { name: "Take it again" });
  await expect(again).toBeVisible();
  const againBox = (await again.boundingBox())!;
  const frameBox = (await frameWrapper(page).boundingBox())!;
  expect(againBox.width).toBeGreaterThanOrEqual(64);
  expect(againBox.height).toBeGreaterThanOrEqual(64);
  expect(againBox.x + againBox.width).toBeLessThanOrEqual(frameBox.x + frameBox.width + 1);
  expect(againBox.y + againBox.height).toBeLessThanOrEqual(frameBox.y + frameBox.height + 1);
  await again.click();
  await expect(page.getByRole("dialog", { name: "Take a photo" })).toBeVisible();
  const shutter2 = page.getByRole("button", { name: "Take photo" });
  await expect(shutter2).toBeEnabled({ timeout: 15_000 });
  await shutter2.click();
  await expect(page.locator('div[data-frame="filled"] img')).toHaveCount(1);

  // Undo takes the photo out; redo puts it back.
  await page.locator('button[title="Undo"]').click();
  await page.locator('button[title="Undo"]').click();
  await expect(page.locator('div[data-frame="empty"]')).toHaveCount(1);
  await page.locator('button[title="Redo"]').click();
  await expect(page.locator('div[data-frame="filled"]')).toHaveCount(1);

  // The rest of the page is still theirs to draw on.
  await drawOnCanvas(page);

  // The flattened page carries the photo inside the frame and nothing outside
  // it: the stub paints magenta, so the frame's region is not white.
  await expect
    .poll(() => darkShare(page, [320, 220, 360, 260]), { timeout: 10_000 })
    .toBeGreaterThan(0.9);
  expect(await darkShare(page, [20, 20, 200, 120])).toBeLessThan(0.05);

  await page.locator('button[title="Done"]').click();
  await page.getByRole("button", { name: /hand it in/i }).click();
  await page.waitForURL((url) => url.pathname === "/student/popped");
});

test("a child cannot move, resize or remove the frame", async ({ page, context }) => {
  await context.grantPermissions(["camera"]);
  await stubCamera(page);
  await buildTemplateWithFrame(page, "Frame fixed");
  await openAsChild(page, "Frame fixed");

  const wrap = frameWrapper(page);
  await page.locator('button[aria-label="Move"]').click();
  expect(await wrap.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");

  const dragAcross = async () => {
    const before = (await wrap.boundingBox())!;
    // Start on the frame's edge, clear of the tap button, so what is under
    // the pointer is the object wrapper and not the button above it.
    await page.mouse.move(before.x + 4, before.y + 4);
    await page.mouse.down();
    await page.mouse.move(before.x + 104, before.y + 54, { steps: 8 });
    await page.mouse.move(before.x + 204, before.y + 104, { steps: 8 });
    await page.mouse.up();
    // A drag that starts and ends on the empty frame's tap button is a click
    // to the browser, so the camera opens: that is the button doing its job,
    // not the frame moving. Put it away and measure.
    const dialog = page.getByRole("dialog", { name: "Take a photo" });
    if (await dialog.isVisible()) {
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
    }
    const after = (await wrap.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  };
  await dragAcross();
  await expect(page.getByRole("button", { name: "Remove object" })).toHaveCount(0);
  await expect(page.locator("div[data-object]")).toHaveCount(1);

  // Filled, it is just as fixed.
  await page.getByRole("button", { name: "Take a photo" }).click();
  const shutter = page.getByRole("button", { name: "Take photo" });
  await expect(shutter).toBeEnabled({ timeout: 15_000 });
  await shutter.click();
  await expect(page.locator('div[data-frame="filled"]')).toHaveCount(1);
  await dragAcross();
  await expect(page.getByRole("button", { name: "Remove object" })).toHaveCount(0);
});

test("a child can switch to the front camera when the device has one", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["camera"]);
  await stubCamera(page, { cameras: 2 });
  await buildTemplateWithFrame(page, "Frame flip");
  await openAsChild(page, "Frame flip");

  await page.getByRole("button", { name: "Take a photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Take a photo" });
  await expect(dialog.getByRole("button", { name: "Take photo" })).toBeEnabled({ timeout: 15_000 });

  // Opens on the rear camera: the ordinary job is photographing a thing on the
  // desk, not the child holding the tablet.
  expect(await facingNow(page)).toBe("environment");
  const video = dialog.locator("video");
  expect(await video.evaluate((el) => getComputedStyle(el).transform)).toBe("none");

  const flip = page.locator("button[data-camera-flip]");
  await expect(flip).toBeVisible();
  const box = (await flip.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(64);
  expect(box.height).toBeGreaterThanOrEqual(64);

  await flip.click();
  await expect(dialog.getByRole("button", { name: "Take photo" })).toBeEnabled({ timeout: 15_000 });
  expect(await facingNow(page)).toBe("user");
  // The front preview is mirrored, as every phone camera app mirrors it.
  expect(await video.evaluate((el) => getComputedStyle(el).transform)).toContain("-1");

  // And it still takes a photo after switching.
  await dialog.getByRole("button", { name: "Take photo" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('div[data-frame="filled"] img')).toHaveCount(1);
});

test("a device with one camera is offered no switch button", async ({ page, context }) => {
  await context.grantPermissions(["camera"]);
  await stubCamera(page, { cameras: 1 });
  await buildTemplateWithFrame(page, "Frame one camera");
  await openAsChild(page, "Frame one camera");

  await page.getByRole("button", { name: "Take a photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Take a photo" });
  await expect(dialog.getByRole("button", { name: "Take photo" })).toBeEnabled({ timeout: 15_000 });
  await expect(page.locator("button[data-camera-flip]")).toHaveCount(0);
});

test("when the camera will not open, a child can choose a picture instead", async ({
  page,
}) => {
  await stubCamera(page, { fail: true });
  await buildTemplateWithFrame(page, "Frame fallback");
  await openAsChild(page, "Frame fallback");

  await page.getByRole("button", { name: "Take a photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Take a photo" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Choose a picture instead", { exact: true })).toBeVisible();
  await page.locator("input[data-frame-file]").setInputFiles("tests/fixtures/tiny.png");
  await expect(dialog).toBeHidden();
  await expect(page.locator('div[data-frame="filled"] img')).toHaveCount(1);
  await expect(page.getByText(/didn't work|can't open/)).toHaveCount(0);
});
