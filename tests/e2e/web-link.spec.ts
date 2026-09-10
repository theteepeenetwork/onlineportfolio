import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, studentLogin, logout } from "./helpers";

// Web links on a canvas (SAFEGUARDING rule 26): the one thing a child can press
// that leaves StoryJar.
//
// What this holds, end to end:
//   - only a teacher can put one on a page, and the builder refuses what the
//     server would refuse, in words;
//   - a child sees the teacher's name for it AND the real host, and cannot add,
//     move or delete one;
//   - pressing it never opens anything by itself: a full-screen card comes
//     first, with Stay here focused, and Escape stays;
//   - Open it is a new tab that cannot reach back into the child's tab and is
//     not told where it came from.

const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});

// A run for the whole of Sunflower whose only page carries one link, written
// straight to the database so a test can say exactly what the teacher saved.
async function runWithLink(title: string, link: Record<string, unknown>) {
  const teacher = await db.teacher.findUniqueOrThrow({ where: { email: "teacher@school.uk" } });
  const klass = await db.class.findFirstOrThrow({ where: { name: "Sunflower Class", teacherId: teacher.id } });
  const objectsJson = JSON.stringify([[{ id: "o1", type: "link", x: 80, y: 80, ...link }]]);
  const template = await db.activityTemplate.create({ data: { title, teacherId: teacher.id, objectsJson } });
  const run = await db.assignment.create({
    data: {
      templateId: template.id,
      classId: klass.id,
      wholeClass: true,
      status: "LIVE",
      title,
      objectsSnapshotJson: objectsJson,
    },
  });
  return {
    cleanup: async () => {
      await db.journalItem.deleteMany({ where: { assignmentId: run.id } });
      await db.draft.deleteMany({ where: { assignmentId: run.id } });
      await db.assignment.delete({ where: { id: run.id } }).catch(() => {});
      await db.activityTemplate.delete({ where: { id: template.id } }).catch(() => {});
    },
  };
}

async function openRun(page: Page, child: string, title: string) {
  await studentLogin(page, child);
  await page.goto("/student/activities");
  await page.getByRole("link", { name: new RegExp(title) }).first().click();
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(page.getByText("Loading…")).toHaveCount(0);
}

test("a teacher adds a web link and changes it; the builder refuses what the server would", async ({ page }) => {
  let templateId: string | null = null;
  try {
    await teacherLogin(page);
    await page.goto("/teacher/activities/new");
    await page.fill("#title", "Water cycle links");
    await page.getByRole("button", { name: /Build a template/ }).click();
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Web link", exact: true }).click();

    const add = page.getByRole("dialog", { name: "Add a web link" });
    await expect(add.getByLabel("Web address")).toBeFocused();
    await add.getByLabel("Web address").fill("http://example.org/rain");
    await add.getByRole("button", { name: "Add link" }).click();
    await expect(add.getByRole("alert"), "refused in words, not dropped later").toContainText("https://");
    await add.getByLabel("Web address").fill("https://www.example.org/water-cycle");
    await add.getByLabel(/Name for it/).fill("The water cycle");
    // Enter adds the link — and only the link. The canvas sits inside the
    // template's own form, and an Enter that submitted THAT would close the
    // builder and throw the page away.
    await add.getByLabel(/Name for it/).press("Enter");
    await expect(add).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save template" })).toBeVisible();

    const chip = page.locator('[data-link="example.org"]');
    await expect(chip).toContainText("The water cycle");
    await expect(chip, "the real host is shown under the name").toContainText("example.org");

    await page.getByRole("button", { name: "Change the link" }).click();
    const change = page.getByRole("dialog", { name: "Change this web link" });
    await expect(change.getByLabel("Web address")).toHaveValue("https://www.example.org/water-cycle");
    await change.getByLabel("Web address").fill("https://kids.example.org/rain");
    await change.getByRole("button", { name: "Save link" }).click();
    await expect(page.locator('[data-link="kids.example.org"]')).toContainText("The water cycle");

    await page.locator('button[title="Done"]').click();
    await page.getByRole("button", { name: /Save to library/ }).click();
    await expect(page.getByRole("heading", { name: "Water cycle links" })).toBeVisible();

    const saved = await db.activityTemplate.findFirstOrThrow({
      where: { title: "Water cycle links" },
      orderBy: { createdAt: "desc" },
    });
    templateId = saved.id;
    const links = (JSON.parse(saved.objectsJson ?? "[]") as { type: string; href?: string; label?: string }[][])
      .flat()
      .filter((o) => o.type === "link");
    expect(links).toEqual([expect.objectContaining({ href: "https://kids.example.org/rain", label: "The water cycle" })]);
  } finally {
    if (templateId) await db.activityTemplate.delete({ where: { id: templateId } }).catch(() => {});
  }
});

test("a child meets the leaving card first, and Open it tells the site nothing", async ({ page, context }) => {
  const run = await runWithLink("Rain links", {
    w: 380,
    h: 110,
    href: "https://kids.example.org/rain",
    label: "All about rain",
  });
  try {
    await openRun(page, "Ella", "Rain links");

    // A child's toolbox has no way to make one.
    await page.locator('button[title="Add"]').click();
    await expect(page.getByRole("button", { name: "Words", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Web link", exact: true })).toHaveCount(0);
    await page.locator('button[title="Close"]').click();

    const link = page.getByRole("button", { name: "All about rain, kids.example.org" });
    await expect(link).toBeVisible();

    // And cannot move one: a drag from it leaves it where the teacher put it,
    // with no controls to delete it.
    const chip = page.locator('div[data-object][data-id="o1"]');
    const before = (await chip.boundingBox())!;
    const lb = (await link.boundingBox())!;
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width / 2 + 150, lb.y + lb.height / 2 + 100, { steps: 8 });
    await page.mouse.up();
    const cardName = /This opens kids\.example\.org — a website your teacher chose/;
    const card = page.getByRole("dialog", { name: cardName });
    if (await card.count()) await card.getByRole("button", { name: "Stay here" }).click();
    expect(await chip.boundingBox()).toEqual(before);
    await expect(page.getByRole("button", { name: "Remove object" })).toHaveCount(0);

    // Pressing it opens the card, never the site.
    let popups = 0;
    page.on("popup", () => (popups += 1));
    await link.click();
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Stay here" }), "staying is the default").toBeFocused();
    expect(popups).toBe(0);

    // Full screen and opaque: every corner of the screen is the card.
    const covered = await page.evaluate(() => {
      const el = document.querySelector("[data-leaving-card]");
      const w = window.innerWidth;
      const h = window.innerHeight;
      return [
        [2, 2],
        [w - 3, 2],
        [2, h - 3],
        [w - 3, h - 3],
      ].every(([x, y]) => !!el && el.contains(document.elementFromPoint(x, y)));
    });
    expect(covered, "nothing of the canvas shows round the card").toBe(true);

    await card.getByRole("button", { name: "Stay here" }).click();
    await expect(card).toHaveCount(0);
    await link.click();
    await expect(card).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card, "Escape stays").toHaveCount(0);

    // Open it: a new tab, which cannot script back into this one and is not
    // told which page sent the child there.
    await context.route("https://kids.example.org/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Rain</title><p>Rain</p>" }),
    );
    await link.click();
    const open = card.getByRole("link", { name: "Open it" });
    await expect(open).toHaveAttribute("href", "https://kids.example.org/rain");
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");
    const [popup] = await Promise.all([page.waitForEvent("popup"), open.click()]);
    await popup.waitForLoadState();
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    expect(await popup.evaluate(() => document.referrer)).toBe("");
    await popup.close();
    await expect(card, "coming back is coming back to the work").toHaveCount(0);
  } finally {
    await run.cleanup();
  }
});

test("only the teacher's own words reach the page: a label is text, and a link is a finger's width", async ({
  page,
}) => {
  // The smallest link a teacher can save, on the smallest tablet a child uses.
  await page.setViewportSize({ width: 768, height: 1024 });
  const label = `<img src=x onerror="window.__xss=1">`;
  const run = await runWithLink("Label links", { w: 200, h: 84, href: "https://example.org/", label });
  try {
    await openRun(page, "Ella", "Label links");
    const link = page.getByRole("button", { name: `${label}, example.org` });
    await expect(link).toBeVisible();
    await expect(page.locator('[data-link="example.org"]')).toContainText(label);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

    const box = (await link.boundingBox())!;
    expect(Math.min(box.width, box.height), "SAFEGUARDING rule 18").toBeGreaterThanOrEqual(64);
  } finally {
    await run.cleanup();
  }
});

// Only a link that came in the teacher's snapshot can be pressed, and what it
// opens is read from that snapshot. A child's device keeps its own copy of the
// page (the draft), and that copy is the child's to change — so a link planted
// there may draw a chip, and must never become something that opens.
test("a link that was never the teacher's cannot be pressed, even from a restored draft", async ({ page }) => {
  const run = await runWithLink("Planted links", {
    w: 380,
    h: 110,
    href: "https://kids.example.org/rain",
    label: "All about rain",
  });
  try {
    await studentLogin(page, "Ella");
    const assignment = await db.assignment.findFirstOrThrow({ where: { title: "Planted links" } });
    const ella = await db.student.findFirstOrThrow({ where: { name: "Ella", class: { name: "Sunflower Class" } } });
    const planted = {
      key: `resp:${assignment.id}:${ella.id}`,
      ownerId: ella.id,
      surface: "activity-response",
      updatedAt: Date.now(),
      fields: {},
      canvas: {
        v: 1,
        pages: [""],
        templates: [null],
        objects: [
          [
            { id: "o1", type: "link", x: 80, y: 80, w: 380, h: 110, href: "https://evil.example/", label: "All about rain", fromTemplate: true },
            { id: "o9", type: "link", x: 80, y: 400, w: 380, h: 110, href: "https://evil.example/", label: "Planted" },
          ],
        ],
        current: 0,
        anyDrawn: true,
        nextObjId: 10,
        added: [true],
      },
    };
    await page.evaluate(
      (record) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("storyjar-drafts", 1);
          open.onupgradeneeded = () => open.result.createObjectStore("drafts", { keyPath: "key" });
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction("drafts", "readwrite");
            tx.objectStore("drafts").put(record);
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
      planted,
    );

    await page.goto("/student/activities");
    await page.getByRole("link", { name: /Planted links/ }).first().click();
    await page.getByRole("button", { name: /Restore my work/i }).click();
    await expect(page.locator('[data-link="evil.example"]').first(), "the planted chips are drawn").toBeVisible();

    // The planted one opens nothing at all; the teacher's opens the teacher's
    // address, whatever the draft said it was.
    await expect(page.getByRole("button", { name: /Planted/ })).toHaveCount(0);
    await page.getByRole("button", { name: "All about rain, kids.example.org" }).click();
    const card = page.getByRole("dialog", { name: /This opens kids\.example\.org/ });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "https://kids.example.org/rain");
  } finally {
    await run.cleanup();
  }
});

// The card can be read aloud for a child who cannot read it yet, and what is
// read is StoryJar's own fixed sentence. The host is the teacher's choice, not
// our copy: it is shown and never spoken (rule 26, and the read-aloud notes).
test("the card reads aloud only StoryJar's own words, never the address", async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    class Utterance {
      text: string;
      lang = "";
      rate = 1;
      voice = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [],
        cancel() {},
        speak(u: Utterance) {
          spoken.push(u.text);
        },
        addEventListener() {},
        removeEventListener() {},
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: Utterance });
  });
  const run = await runWithLink("Spoken links", { w: 380, h: 110, href: "https://kids.example.org/rain", label: "All about rain" });
  try {
    await openRun(page, "Ella", "Spoken links");
    await page.getByRole("button", { name: "All about rain, kids.example.org" }).click();
    const card = page.getByRole("dialog", { name: /This opens kids\.example\.org/ });
    await card.getByRole("button", { name: "Hear it" }).click();
    const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    expect(spoken).toEqual(["This opens a website your teacher chose."]);
  } finally {
    await run.cleanup();
  }
});

test("an address the server would refuse never reaches a child's page", async ({ page }) => {
  const run = await runWithLink("Refused links", { w: 380, h: 110, href: "javascript:alert(1)", label: "Refused" });
  try {
    await openRun(page, "Ella", "Refused links");
    await expect(page.getByRole("button", { name: /Refused/ })).toHaveCount(0);
    await expect(page.locator("[data-link]")).toHaveCount(0);
  } finally {
    await run.cleanup();
  }
});

test.afterEach(async ({ page }) => {
  await logout(page);
});
