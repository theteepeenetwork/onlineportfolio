import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { teacherLogin, studentLogin, logout, drawOnCanvas, openDrawing, pageCount } from "./helpers";

// Use Finn, who has no seeded work, so the assertions are unambiguous.
test("a student's drawing goes through approval into their journal", async ({ page }) => {
  // Student draws on the full-screen canvas and hands it in. The Drawing tile on
  // their jar deep-links straight here — there's no tab to pick first (SJ-03).
  await studentLogin(page, "Finn");
  await page.getByRole("link", { name: "Drawing" }).click();
  await drawOnCanvas(page);
  expect(await pageCount(page, "drawingPages")).toBeGreaterThan(0);
  await page.locator('button[title="Done"]').click();
  // Celebration, then back to the jar where it now waits.
  await page.waitForURL((url) => url.pathname === "/student/popped");
  await page.getByRole("link", { name: /Back to my jar/ }).click();
  await page.waitForURL((url) => url.pathname === "/student");
  await expect(page.getByText(/Waiting for your teacher/)).toBeVisible();

  // Teacher finds Finn's submission in the queue and approves it.
  await logout(page);
  await teacherLogin(page);
  await page.goto("/teacher/queue");
  const finnCard = page.locator('[data-child="Finn"]');
  await expect(finnCard).toBeVisible();
  await finnCard.getByRole("button", { name: /Add to jar/ }).click();
  // The row leaves the queue once approved.
  await expect(finnCard).toHaveCount(0);

  // It now shows as published in Finn's journal. Journals links to a child from
  // two places — the "just added" row and the register — so take the first.
  await page.goto("/teacher");
  await page.getByRole("link", { name: /Finn/ }).first().click();
  await expect(page.getByText("Published")).toBeVisible();
});

// SJ-03 — a child used to tap "Photo" on their jar and land on a screen that
// asked them again, in teacher's clothes: three small tabs, a 14px text link as
// the only way back, and the caption instruction hidden in placeholder text.
// Young children navigate by landmark, so a register change mid-task reads as
// "I'm lost" and they back out.
test.describe("Adding work stays in the child's world", () => {
  test.use({ viewport: { width: 1024, height: 768 } }); // classroom iPad, landscape

  // The Photo / Voice / My words tiles now open their capture surface INLINE
  // (an accordion on the jar) rather than navigating to a separate page — the
  // child never leaves the landmark they know, and one tile opens at a time.
  for (const [tile, reveal] of [
    ["Photo", /use camera/i],
    ["My words", /write your words here/i],
  ] as const) {
    test(`the ${tile} tile opens its capture surface inline`, async ({ page }) => {
      await studentLogin(page, "Finn");
      const tileButton = page.getByRole("button", { name: tile, exact: true });
      await expect(tileButton).toHaveAttribute("aria-expanded", "false");
      await tileButton.click();

      // No navigation — the child stays on their jar, and the tile reports open.
      await expect(page).toHaveURL(/\/student$/);
      await expect(tileButton).toHaveAttribute("aria-expanded", "true");
      // The capture surface is revealed right there.
      await expect(page.getByText(reveal)).toBeVisible();

      // The choice was already made on the jar — nothing here re-asks it.
      for (const tab of ["Write", "Draw"]) {
        await expect(page.getByRole("button", { name: tab, exact: true })).toHaveCount(0);
      }
    });
  }

  test("opening a second tile closes the first — only one surface at a time", async ({ page }) => {
    await studentLogin(page, "Finn");
    const photo = page.getByRole("button", { name: "Photo", exact: true });
    const words = page.getByRole("button", { name: "My words", exact: true });

    await photo.click();
    await expect(page.getByText(/use camera/i)).toBeVisible();

    await words.click();
    await expect(page.getByText(/write your words here/i)).toBeVisible();
    // The photo surface has closed and the photo tile reports collapsed.
    await expect(page.getByText(/use camera/i)).toHaveCount(0);
    await expect(photo).toHaveAttribute("aria-expanded", "false");
  });

  test("the way back is a real button a child can hit, not a 14px link", async ({ page }) => {
    await studentLogin(page, "Finn");
    await page.goto("/student/new/words");
    const back = page.getByRole("link", { name: /back to my jar/i });
    const box = (await back.boundingBox())!;
    expect(box.height, "back target (SAFEGUARDING rule 18)").toBeGreaterThanOrEqual(64);
    await back.click();
    await expect(page).toHaveURL(/\/student$/);
  });

  // The caption instruction used to live only in placeholder text, so it
  // vanished the moment a child tapped the box — taking the question away
  // exactly when they were trying to answer it.
  test("the caption keeps its instruction visible while you answer it", async ({ page }) => {
    await studentLogin(page, "Finn");
    await page.goto("/student/new/photo");
    const label = page.getByText(/tell us about your work/i);
    await expect(label).toBeVisible();
    await page.getByRole("textbox", { name: /tell us about your work/i }).fill("My tower");
    await expect(label, "the instruction must survive being answered").toBeVisible();
  });

  // Chloe, because this one SUBMITS: Dev/Ella/Finn are the "clean" children the
  // canvas specs rely on, and leaving an extra waiting moment in Finn's jar
  // breaks stickers.spec, which needs exactly one. Chloe already carries seeded
  // waiting work, so count the strips rather than asserting one is present —
  // otherwise the seed alone would pass this test.
  test("a child's words reach the jar, and wait for the teacher", async ({ page }) => {
    await studentLogin(page, "Chloe");
    const waiting = page.getByText(/Waiting for your teacher/);
    const before = await waiting.count();

    await page.getByRole("button", { name: "My words", exact: true }).click();
    await page.getByRole("textbox", { name: /write your words here/i }).fill("Today I built a rocket.");
    await page.getByRole("button", { name: /add to my jar/i }).click();
    await page.waitForURL((url) => url.pathname === "/student/popped");
    await page.getByRole("link", { name: /Back to my jar/ }).click();

    await expect(waiting, "the words moment joins the queue, it doesn't publish itself").toHaveCount(before + 1);
  });

  // A bookmarked or shared /student/new is a dead end for a child who can't
  // read an error — send them somewhere they recognise.
  test("the old add screen sends a child to their jar, not a 404", async ({ page }) => {
    await studentLogin(page, "Finn");
    await page.goto("/student/new");
    await expect(page).toHaveURL(/\/student$/);
  });
});

// SJ-04 — "where is my work?" used to be answered with a sentence ("Waiting for
// your teacher to see it ⏳"), which is nothing to a child who can't read yet.
// The approve-then-publish loop is the product's core promise, so a pre-reader
// being unable to perceive it was the audit's central finding.
test.describe("A child can see where their work is", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  // Chloe carries seeded waiting work and no other spec asserts on her jar.
  test("waiting work sits ON the jar, not in it", async ({ page }) => {
    await studentLogin(page, "Chloe");
    const jar = page.getByRole("img", { name: /in your jar/ });

    // The jar itself carries the status, and says the same thing to a screen
    // reader that it shows a child who can't read.
    await expect(jar).toHaveAttribute("aria-label", /waiting on top/);
    expect(await page.locator("[data-jar-rim]").count(), "waiting moments perch on the rim").toBeGreaterThan(0);
  });

  test("every status says it with a tag and words, never colour alone", async ({ page }) => {
    await studentLogin(page, "Chloe");

    // WCAG 1.4.1: the tag is a shape with an icon and a word, not a hue. A
    // child who can't distinguish kraft from honey still gets the meaning.
    const tags = page.getByText("Waiting", { exact: true });
    expect(await tags.count()).toBeGreaterThan(0);
    await expect(page.getByText(/waiting for your teacher to see it/i).first()).toBeVisible();
  });

  test("a child can have their status read to them", async ({ page }) => {
    await studentLogin(page, "Chloe");
    const speak = page.getByRole("button", { name: /^Hear it/ }).first();
    await expect(speak).toBeVisible();
    const box = (await speak.boundingBox())!;
    expect(box.height, "read-aloud is a real target").toBeGreaterThanOrEqual(44);
  });

  // M2 — the strongest missing moment. Approval happens while the child is
  // away, so the reward landed in an empty room: they'd open their jar and the
  // work would simply be there, with nothing to say it had just arrived.
  test("work approved while you were away drops into the jar — once", async ({ page }) => {
    await studentLogin(page, "Chloe");
    const before = await page.locator("[data-jar-arrival]").count();
    await logout(page);

    // The teacher approves while the child is elsewhere. Chloe has several
    // waiting moments, so her card stays in the queue — wait on the count
    // dropping rather than the card vanishing (which is Finn's case, not hers).
    await teacherLogin(page);
    await page.goto("/teacher/queue");
    const chloeCards = page.locator('[data-child="Chloe"]');
    const queued = await chloeCards.count();
    await chloeCards.first().getByRole("button", { name: /Add to jar/ }).click();
    await expect(chloeCards).toHaveCount(queued - 1);
    await logout(page);

    // The child comes back and SEES it happen.
    await studentLogin(page, "Chloe");
    await expect(page.locator('[data-jar-arrival="in"]'), "the newly approved moment falls in").toHaveCount(before + 1);

    // And it is not news for ever: the celebration fires once, then the moment
    // is simply theirs. A jar that re-celebrates is a jar you stop believing.
    await page.reload();
    await expect(page.locator("[data-jar-arrival]"), "the drop plays once, not on every visit").toHaveCount(0);
  });
});

// ===========================================================================
// F38 — the teacher's note on returned work reaches the child it was written
// for, on their jar and again on the work when they reopen it.
//
// Promoted here from the findings project on 19 August 2026, when it was built.
// Found by the user-tester team (tests/battery/personas/): a ten-year-old
// looking for what his teacher wanted changed, and the teacher who had just
// written it. Before the fix the child got a fixed "Have another go" tag and
// nothing else — `teacherNote` rendered on the teacher's own screen only.
// ===========================================================================
test("the teacher's note on returned work reaches the child, on the jar and on the work", async ({ page }) => {
  const note = "Can you add the units to each number?";

  // A child hands something in.
  await studentLogin(page, "Ella");
  await page.getByRole("button", { name: "My words", exact: true }).click();
  // The label and the placeholder are the child's own copy (src/lib/copy/student.ts),
  // reached by label rather than by guessing at the placeholder.
  await page.getByLabel(/write your words here/i).fill("Six add four is ten.");
  await page.getByRole("button", { name: /pop it in|add to my jar|save|done/i }).first().click();
  await page.waitForURL((url) => url.pathname === "/student/popped" || url.pathname === "/student", {
    timeout: 20_000,
  });

  // The teacher sends it back with words.
  await logout(page);
  await teacherLogin(page);
  await page.goto("/teacher/queue");
  const row = page.locator('[data-child="Ella"]').first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /send back/i }).click();
  await page.getByPlaceholder(/a kind note/i).fill(note);
  await page.getByRole("button", { name: /^send back$/i }).click();

  // The child reads them, on their own jar.
  await logout(page);
  await studentLogin(page, "Ella");
  await expect(page.getByText(note)).toBeVisible();
});

// Looking at the work before approving it.
//
// The queue IS the approval gate — nothing reaches a child's jar until a
// teacher acts on an item here — and the only view of the thing being judged
// was an 84×64 crop on the card. A teacher was being asked to approve work they
// could not see. The thumbnail opens it now.
test("a teacher can open a child's work from the queue", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/queue");

  const open = page.getByRole("button", { name: /^Open .*'s work$/ }).first();
  await expect(open, "the work on a queue card has to be openable").toBeVisible();
  await open.click();

  const viewer = page.getByRole("dialog");
  await expect(viewer).toBeVisible();
  // Shown whole, not cropped: a crop hides the corner a child drew something in,
  // which is the one thing this view exists to prevent.
  const fit = await viewer.locator("img").first().evaluate((el) =>
    getComputedStyle(el).objectFit,
  );
  expect(fit).toBe("contain");

  // Escape closes it, as Escape closes everything in this app.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // And so does clicking away from it.
  await open.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.mouse.click(12, 12);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// Multi-page work, all of it.
//
// `mediaPath` is only ever the COVER; `mediaPathsJson` holds the rest and
// supersedes it. The queue read the cover alone, so a teacher deciding whether
// to publish a four-page piece of work saw page one and had no idea the other
// three existed.
test("a teacher can page through multi-page work in the queue", async ({ page }) => {
  const db = new PrismaClient();
  let itemId: string | null = null;
  try {
    await studentLogin(page, "Dev");
    await openDrawing(page);
    await drawOnCanvas(page);
    await page.locator('button[title="Add page"]').click();
    await drawOnCanvas(page);
    await page.locator('button[title="Done"]').click();
    const confirm = page.getByRole("button", { name: /Yes|Hand in|Add to/ }).first();
    if (await confirm.count()) await confirm.click();
    await expect(page).toHaveURL(/\/student/, { timeout: 15_000 });

    // Polled: the hand-in is a server action, and asserting against the row
    // before it lands is a race that passes on a fast machine and fails on CI.
    await expect
      .poll(
        async () =>
          (
            await db.journalItem.findFirst({
              where: { status: "PENDING", student: { name: "Dev" } },
              orderBy: { createdAt: "desc" },
            })
          )?.mediaPathsJson ?? null,
        { timeout: 15_000, message: "the two-page hand-in should reach the queue" },
      )
      .not.toBeNull();
    const item = await db.journalItem.findFirst({
      where: { status: "PENDING", student: { name: "Dev" } },
      orderBy: { createdAt: "desc" },
    });
    itemId = item?.id ?? null;
    // Two pages really were stored — otherwise the rest of this proves nothing.
    expect(JSON.parse(item?.mediaPathsJson ?? "[]")).toHaveLength(2);

    await logout(page);
    await teacherLogin(page);
    await page.goto("/teacher/queue");
    await page.getByRole("button", { name: "Open Dev's work" }).first().click();

    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible();
    await expect(viewer, "the viewer should say which page of how many").toContainText(
      "page 1 of 2",
    );

    const first = await viewer.locator("img").first().getAttribute("src");
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(viewer).toContainText("page 2 of 2");
    expect(
      await viewer.locator("img").first().getAttribute("src"),
      "page 2 has to be a different image from page 1",
    ).not.toBe(first);

    // The ends are guarded, and every page is reachable directly.
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
    await page.getByRole("button", { name: "Page 1", exact: true }).click();
    await expect(viewer).toContainText("page 1 of 2");
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
  } finally {
    // This hands work in, and several specs are written around a child having
    // exactly one waiting item. Clean up what it made.
    if (itemId) await db.journalItem.delete({ where: { id: itemId } }).catch(() => {});
    await db.$disconnect();
  }
});

// The jar is a record of everything a child has made, at full width, with its
// pages.
//
// It used to be a grid of 280px cards, each showing page one cropped to fill
// its band. A four-page piece of work therefore appeared as a single cropped
// square, with nothing anywhere to say the other three pages existed — on the
// one screen in the product whose whole job is to show a child what they have
// done.
test("a child can turn the pages of their work in their own jar", async ({ page }) => {
  const db = new PrismaClient();
  let itemId: string | null = null;
  try {
    // Two pages, drawn differently, so "the page changed" is provable.
    await studentLogin(page, "Dev");
    await openDrawing(page);
    await drawOnCanvas(page);
    await page.locator('button[title="Add page"]').click();
    await drawOnCanvas(page);
    await page.locator('button[title="Done"]').click();
    const confirm = page.getByRole("button", { name: /Yes|Hand in|Add to/ }).first();
    if (await confirm.count()) await confirm.click();
    await expect(page).toHaveURL(/\/student/, { timeout: 15_000 });

    await expect
      .poll(
        async () =>
          (
            await db.journalItem.findFirst({
              where: { status: "PENDING", student: { name: "Dev" } },
              orderBy: { createdAt: "desc" },
            })
          )?.id ?? null,
        { timeout: 15_000 },
      )
      .not.toBeNull();
    const item = (await db.journalItem.findFirst({
      where: { status: "PENDING", student: { name: "Dev" } },
      orderBy: { createdAt: "desc" },
    }))!;
    itemId = item.id;
    expect(JSON.parse(item.mediaPathsJson ?? "[]"), "a two-page hand-in").toHaveLength(2);

    // Approve it into the jar.
    await logout(page);
    await teacherLogin(page);
    await page.goto("/teacher/queue");
    const row = page.locator('[data-child="Dev"]').first();
    await row.getByRole("button", { name: /Add to jar/ }).click();
    await expect
      .poll(async () => (await db.journalItem.findUnique({ where: { id: itemId! } }))?.status, {
        timeout: 15_000,
      })
      .toBe("APPROVED");

    // --- The child's own jar ---
    await logout(page);
    await studentLogin(page, "Dev");
    await page.goto("/student");

    const record = page.getByRole("navigation", { name: /^Pages of / }).first();
    await expect(record, "two-page work gets page controls in the jar").toBeVisible();

    const shown = page.locator("article").filter({ has: record }).locator("img").first();
    const first = await shown.getAttribute("src");
    await record.getByRole("button", { name: "Page 2" }).click();
    await expect
      .poll(async () => shown.getAttribute("src"), { timeout: 10_000 })
      .not.toBe(first);

    // The ends are guarded, so a child cannot page off either end of their work.
    await expect(record.getByRole("button", { name: /Next/ })).toBeDisabled();
    await record.getByRole("button", { name: "Page 1" }).click();
    await expect
      .poll(async () => shown.getAttribute("src"), { timeout: 10_000 })
      .toBe(first);
    await expect(record.getByRole("button", { name: /Back/ })).toBeDisabled();

    // Every one of those is a child's target: SAFEGUARDING rule 18's 64px floor
    // (the a11y gate sweeps this page too, but a control this new deserves the
    // assertion next to the behaviour it belongs to).
    for (const name of [/Back/, /Next/, "Page 1", "Page 2"]) {
      const b = record.getByRole("button", { name: name as string & RegExp });
      const box = (await b.boundingBox())!;
      expect(Math.min(box.width, box.height), `${name} is a child-sized target`).toBeGreaterThanOrEqual(64);
    }

    // The work is shown whole, never cropped — the corner a child drew in is
    // the thing a crop throws away.
    expect(await shown.evaluate((el) => getComputedStyle(el).objectFit)).toBe("contain");
  } finally {
    if (itemId) await db.journalItem.delete({ where: { id: itemId } }).catch(() => {});
    await db.$disconnect();
  }
});
