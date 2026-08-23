import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, studentLogin, logout, openDrawing, drawOnCanvas } from "./helpers";

// A child must always be able to leave.
//
// The full-screen canvas is `fixed inset-0`, so the way out cannot live on the
// page or in the layout — either it is underneath the canvas or it is on top of
// the child's drawing. It has to be part of the canvas chrome, and for a long
// time it was: a 64px ✕ captioned "Close", sat next to the green ✓.
//
// That is a way out an adult can see. It is not one a four-year-old can, and
// the tester's report said so — "after tapping around I have ended up somewhere
// with no way back to my jar", filed from exactly this screen. So the escape
// now carries the words of the child's own register and lands on the jar, the
// one landmark a non-reader navigates by.
//
// This test is here so that cannot be quietly undone. It asserts the way out is
// findable BY ITS NAME (which is what a child, a screen reader and the Wriggler
// all look for), is at the 64px child touch floor, goes to the jar, and does
// not hand the work in on the way.

async function assignDrawYourFamily(page: Page) {
  await teacherLogin(page);
  await page.goto("/teacher/activities");
  // "Draw your family" is the one seeded template with no run of its own, so
  // assigning it puts exactly one new card on the child's list.
  await page.getByRole("button", { name: "More actions for Draw your family" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Send to a class" }).click();
  await page.getByRole("button", { name: "Sunflower Class" }).click();
  await page.getByRole("button", { name: /Assign to whole class/ }).click();
  await page.waitForURL((u) => u.searchParams.has("run"));
  return new URL(page.url()).searchParams.get("run")!;
}

// The words, in the register of the class the child is in. Sunflower is KS1
// ("jar"); a KS2 class says "journal" — either is a way back, neither is "Close".
const WAY_BACK = /back to my (jar|journal)/i;

// A title long enough to reach for the chrome on either side of it. The words
// on the way out cost horizontal room in a bar that used to hold a 64px ✕, and
// the narrowest device a child uses is a 768px classroom tablet in portrait —
// so the run this test opens is deliberately the awkward one.
const LONG_TITLE = "Autumn minibeast hunt, tally chart and label the parts";

test("a child answering an activity can get back to their jar", async ({ page }) => {
  const db = new PrismaClient();
  const runId = await assignDrawYourFamily(page);
  try {
    await db.assignment.update({ where: { id: runId }, data: { title: LONG_TITLE } });
    await logout(page);
    // The classroom tablet the child personas use, portrait.
    await page.setViewportSize({ width: 768, height: 1024 });
    await studentLogin(page, "Amara");
    await page.goto("/student/activities");
    await page.getByRole("link", { name: new RegExp(LONG_TITLE) }).first().click();
    await expect(page.locator("canvas").first()).toBeVisible();

    const back = page.getByRole("button", { name: WAY_BACK });
    await expect(
      back,
      "the child is inside a full-screen canvas; the way out has to say where it goes",
    ).toBeVisible();

    // SAFEGUARDING rule 18: 64px on anything a child taps. An escape they can
    // see and cannot hit is not an escape.
    const box = await back.boundingBox();
    expect(box, "the way back has a box to tap").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(64);

    // …and does not sit on the activity's own title while saying it. The title
    // is centred inside a wide, click-through strip, so what matters is where
    // the WORDS are, not where their container is — hence the range measure.
    const ink = await page.getByText(LONG_TITLE).evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const { x, width } = range.getBoundingClientRect();
      return { x, width };
    });
    expect(ink.width, "the activity title is on screen").toBeGreaterThan(0);
    expect(
      box!.x >= ink.x + ink.width || ink.x >= box!.x + box!.width,
      "the way back and the activity's title must not overlap on a 768px tablet",
    ).toBe(true);

    await back.click();
    await page.waitForURL((u) => u.pathname === "/student");

    // Leaving is not handing in. A child who backs out has not shown their
    // half-finished work to the class; their draft is saved and offered back.
    expect(
      await db.journalItem.count({ where: { assignmentId: runId } }),
      "backing out of an activity must not submit it",
    ).toBe(0);
  } finally {
    await db.journalItem.deleteMany({ where: { assignmentId: runId } });
    await db.assignment.delete({ where: { id: runId } }).catch(() => {});
    await db.$disconnect();
  }
});

test("the blank drawing canvas has the same way back", async ({ page }) => {
  // Same surface, same trap: /student/new/drawing hands straight off to the
  // full-screen canvas, so its only way out is the canvas's own.
  await studentLogin(page, "Amara");
  await openDrawing(page);

  const back = page.getByRole("button", { name: WAY_BACK });
  await expect(back).toBeVisible();
  await back.click();
  await page.waitForURL((u) => u.pathname === "/student");
});

// The worst version of "no way back", and the one I could not measure when the
// escape first landed.
//
// The teacher's note on a sent-back piece renders in the canvas's title strip,
// is wider than the title, and is `pointer-events-auto` because it carries its
// own listen button. The strip used to be 60vw centred, which on a 768px tablet
// ran underneath both top corners — so the note could sit ON TOP of the tools
// and the way out, covering them and swallowing the taps.
//
// A child who has had work sent back is the child most likely to be looking for
// the way out, so this is the case that matters most and the one nothing was
// watching. Measured by asking the browser what is actually at each button's
// centre, rather than by comparing rectangles: being covered is the failure, and
// only a hit test sees it.
test("a sent-back piece does not bury the way out under the teacher's note", async ({ page }) => {
  const db = new PrismaClient();
  const runId = await assignDrawYourFamily(page);
  const note =
    "Lovely start Amara — can you add everyone's name underneath their picture, and tell me who is the tallest?";
  try {
    // The child has a go and hands it in.
    await logout(page);
    await studentLogin(page, "Amara");
    await page.goto("/student/activities");
    await page.getByRole("link", { name: /Draw your family/ }).first().click();
    await expect(page.locator("canvas").first()).toBeVisible();
    await drawOnCanvas(page);
    await page.locator('button[title="Done"]').click();
    await page.getByRole("button", { name: /hand it in/i }).click();
    await page.waitForURL((u) => u.pathname === "/student/popped");

    // The teacher sends it back with words. "Keep their work" is the default,
    // which is what puts the note on the canvas rather than on a blank one.
    await logout(page);
    await teacherLogin(page);
    await page.goto("/teacher/queue");
    const card = page.locator('[data-child="Amara"]').filter({ hasText: "Draw your family" });
    await card.getByRole("button", { name: /Send back/ }).click();
    await page.getByPlaceholder(/a kind note/i).fill(note);
    await card.getByRole("button", { name: "Send back", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await db.journalItem.findFirst({ where: { status: "RETURNED", assignmentId: runId } }))
            ?.teacherNote ?? null,
        { timeout: 15_000 },
      )
      .toBe(note);

    // The child reopens it, on the narrowest tablet they use.
    await logout(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await studentLogin(page, "Amara");
    await page.goto("/student/activities");
    await page.getByRole("link", { name: /Draw your family/ }).first().click();
    await expect(page.locator("canvas").first()).toBeVisible();
    await expect(page.getByText(note), "the note is on the work, which is the point").toBeVisible();

    // Every control in the top-left corner answers to its own centre. If the
    // note is over one of them, the browser names the note instead.
    for (const label of [WAY_BACK, /^Undo$/, /^Redo$/, /^Clear page$/]) {
      const control = page.getByRole("button", { name: label });
      await expect(control, `${label} should be on screen`).toBeVisible();
      const box = (await control.boundingBox())!;
      const reachable = await control.evaluate(
        (node, { x, y }) => {
          const el = document.elementFromPoint(x, y);
          return !!el && node.contains(el);
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(
        reachable,
        `something is on top of ${label} — a child with work sent back cannot reach it`,
      ).toBe(true);
    }
  } finally {
    await db.journalItem.deleteMany({ where: { assignmentId: runId } });
    await db.assignment.delete({ where: { id: runId } }).catch(() => {});
    await db.$disconnect();
  }
});
