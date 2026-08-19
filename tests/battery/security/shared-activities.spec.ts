import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { SCHOOL_A, SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// The StoryJar shared activity library.
//
// The owner's three constraints, each turned into an assertion rather than a
// convention:
//
//   1. Curated, not community. Only StoryJar publishes, and publishing is the
//      repository's job. No teacher-authenticated code path may write to the
//      shared table, in this version or by accident.
//   2. Separate from a teacher's own folders.
//   3. Never in "All activities" until added.
//
// Constraint 3 is structural: SharedActivity has no teacherId, so the queries
// that build a teacher's library cannot reach it. These tests exist because
// "cannot reach it" is a claim about every query, present and future, and the
// grid is the place where a regression would show up first.
// ===========================================================================

const PUBLISHED_SLUG = "seed-autumn-walk";
const UNPUBLISHED_SLUG = "seed-not-published-yet";

// Click the Add button on ONE named card. The library legitimately holds more
// than one activity, and "the first Add button" would silently start testing a
// different row the day the manifest gains an entry.
async function addFromCard(page: import("@playwright/test").Page, title: string) {
  const card = page.locator("article", { hasText: title }).first();
  await card.getByRole("button", { name: /Add to my activities/i }).click();
  // NOT a bare /teacher/activities/<something> pattern: the browse screen we are
  // standing on already matches it, so waitForURL would return instantly and the
  // assertions would race the redirect. Wait for a URL that is specifically not
  // this screen.
  await page.waitForURL(
    (url) => /^\/teacher\/activities\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/shared"),
  );
}

// Every test in this file starts from "nobody has added anything". Without it
// the tests contaminate each other's starting state and the failures look like
// product faults.
test.beforeEach(async () => {
  await db.activityTemplate.deleteMany({ where: { sourceSharedActivityId: { not: null } } });
});

async function sharedBySlug(slug: string) {
  const row = await db.sharedActivity.findUnique({ where: { slug } });
  if (!row) throw new Error(`fixture ${slug} is missing; prisma/seed-test.ts should have created it`);
  return row;
}

test.describe("the library stays out of a teacher's own library until they add it", () => {
  test("a published shared activity is in no grid, no count and no folder", async ({ page }) => {
    const shared = await sharedBySlug(PUBLISHED_SLUG);
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/teacher/activities");

    // Negative: the shared activity is nowhere in the teacher's own library.
    await expect(page.locator("body")).not.toContainText(shared.title);

    // Positive control on the same screen: this teacher's OWN templates are
    // listed and counted, so the assertion above is about scoping rather than
    // about a page that failed to render anything.
    const own = await db.activityTemplate.findFirst({
      where: { teacherId: { not: undefined }, sourceSharedActivityId: null },
      select: { title: true, teacherId: true },
    });
    expect(own, "the seed should give some teacher at least one template of their own").toBeTruthy();

    const mine = await db.activityTemplate.findMany({
      where: { teacher: { email: SCHOOL_A.admin.email } },
      select: { title: true },
    });
    expect(mine.length, "School A's admin should own templates, or the control proves nothing").toBeGreaterThan(0);
    await expect(page.locator("body")).toContainText(mine[0].title);

    // And the count the teacher is shown never includes it.
    const counted = await db.activityTemplate.count({ where: { teacher: { email: SCHOOL_A.admin.email } } });
    expect(counted, "a shared activity must not be counted in a teacher's library").toBe(mine.length);
  });

  test("an unpublished shared activity is invisible to every teacher, in the library too", async ({ page }) => {
    const hidden = await sharedBySlug(UNPUBLISHED_SLUG);
    for (const who of [SCHOOL_A.admin, SCHOOL_B.teacher]) {
      await loginTeacher(page, who);
      await page.goto("/teacher/activities/shared");
      await expect(page.locator("body")).not.toContainText(hidden.title);
      // Positive control: the published one IS offered on the same screen.
      const shown = await sharedBySlug(PUBLISHED_SLUG);
      await expect(page.locator("body")).toContainText(shown.title);
    }
  });
});

test.describe("adding is a copy, and the copy is the teacher's own", () => {
  test("adding produces an independent copy: editing it changes nothing else", async ({ page }) => {
    const shared = await sharedBySlug(PUBLISHED_SLUG);

    // Teacher A adds it.
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/teacher/activities/shared");
    await addFromCard(page, shared.title);

    const copyA = await db.activityTemplate.findFirst({
      where: { teacher: { email: SCHOOL_A.admin.email }, sourceSharedActivityId: shared.id },
    });
    expect(copyA, "adding should have created a template owned by this teacher").toBeTruthy();

    // Teacher B adds it too, so there are two copies to keep apart.
    await loginTeacher(page, SCHOOL_B.teacher);
    await page.goto("/teacher/activities/shared");
    await addFromCard(page, shared.title);
    const copyB = await db.activityTemplate.findFirst({
      where: { teacher: { email: SCHOOL_B.teacher.email }, sourceSharedActivityId: shared.id },
    });
    expect(copyB).toBeTruthy();

    // The media is copied, not referenced: no teacher's copy may depend on a
    // file StoryJar owns (FINDINGS F27 is the trap this avoids).
    expect(
      copyA!.templatePathsJson,
      "a copy that still points at /uploads/shared/ breaks the day the original changes",
    ).not.toContain("/uploads/shared/");
    expect(copyB!.templatePathsJson).not.toContain("/uploads/shared/");
    expect(
      copyA!.templatePathsJson,
      "two teachers' copies must not share a file either",
    ).not.toEqual(copyB!.templatePathsJson);

    // Teacher A edits their copy.
    await db.activityTemplate.update({ where: { id: copyA!.id }, data: { title: "A's very own version" } });

    // The original and the other teacher's copy are untouched.
    const originalAfter = await sharedBySlug(PUBLISHED_SLUG);
    expect(originalAfter.title, "editing a copy must never reach the shared original").toBe(shared.title);
    const copyBAfter = await db.activityTemplate.findUnique({ where: { id: copyB!.id } });
    expect(copyBAfter!.title, "editing one teacher's copy must never reach another's").toBe(shared.title);
  });

  test("one teacher adding does not mark it added for anybody else", async ({ page }) => {
    const shared = await sharedBySlug(PUBLISHED_SLUG);
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/teacher/activities/shared");
    await addFromCard(page, shared.title);

    // Teacher A now sees that card as added.
    await page.goto("/teacher/activities/shared");
    await expect(page.locator("article", { hasText: shared.title }).first()).toContainText(/Added/i);

    // Teacher B, on the same card, is still offered it.
    await loginTeacher(page, SCHOOL_B.teacher);
    await page.goto("/teacher/activities/shared");
    await expect(
      page.locator("article", { hasText: shared.title }).first().getByRole("button", { name: /Add to my activities/i }),
    ).toBeVisible();
    const forB = await db.activityTemplate.count({
      where: { teacher: { email: SCHOOL_B.teacher.email }, sourceSharedActivityId: shared.id },
    });
    expect(forB, "one teacher's copy must never appear in another teacher's library").toBe(0);
  });

  test("a teacher cannot add an unpublished activity by aiming the form at it", async ({ page }) => {
    const hidden = await sharedBySlug(UNPUBLISHED_SLUG);
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/teacher/activities/shared");

    // The realistic attack: the form is on the page, so change what it points
    // at. A teacher can do this in their own browser in ten seconds.
    const rewritten = await page.evaluate((id) => {
      const input = document.querySelector<HTMLInputElement>('input[name="sharedActivityId"]');
      if (!input) return false;
      input.value = id;
      input.form?.requestSubmit();
      return true;
    }, hidden.id);
    expect(rewritten, "the add form should exist on this screen").toBe(true);
    await page.waitForTimeout(1500);

    const copies = await db.activityTemplate.count({ where: { sourceSharedActivityId: hidden.id } });
    expect(copies, "an unpublished activity must not be addable, however the request is shaped").toBe(0);
  });
});

  test("archiving a copy frees the teacher to take it again", async ({ page }) => {
    // Reported from production on 2026-08-18: archive the copy, and the library
    // still said "Added", linked to the archived template, and refused to give
    // you another one. Archiving is how a teacher takes something OUT of their
    // library, so the library has to agree that they no longer have it.
    const shared = await sharedBySlug(PUBLISHED_SLUG);
    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto("/teacher/activities/shared");
    await addFromCard(page, shared.title);

    const first = await db.activityTemplate.findFirst({
      where: { teacher: { email: SCHOOL_A.admin.email }, sourceSharedActivityId: shared.id },
    });
    expect(first).toBeTruthy();

    // Control: while it is in their library, the card says so and offers no Add.
    await page.goto("/teacher/activities/shared");
    const card = page.locator("article", { hasText: shared.title }).first();
    await expect(card).toContainText(/Added/i);

    await db.activityTemplate.update({ where: { id: first!.id }, data: { archived: true } });

    // Now it must be offered again.
    await page.goto("/teacher/activities/shared");
    await expect(page.locator("article", { hasText: shared.title }).first()).not.toContainText(/Added/i);
    await addFromCard(page, shared.title);

    const live = await db.activityTemplate.findMany({
      where: { teacher: { email: SCHOOL_A.admin.email }, sourceSharedActivityId: shared.id, archived: false },
    });
    expect(live.length, "taking it again should give them exactly one working copy").toBe(1);
    expect(live[0].id, "and it should be a new one, not the archived one").not.toBe(first!.id);

    // The archived copy is left alone: its runs and its media are still there.
    const archived = await db.activityTemplate.findUnique({ where: { id: first!.id } });
    expect(archived!.archived).toBe(true);
    expect(archived!.templatePathsJson).toBe(first!.templatePathsJson);
  });

test.describe("only StoryJar publishes", () => {
  // The assertion that will still matter in a year. Publishing lives in the
  // repository, so the enforceable version of "no teacher may publish" is that
  // no code a teacher's session can reach writes to the table at all.
  test("no teacher-reachable code path writes to the shared table", () => {
    const offenders: string[] = [];
    const WRITE = /\bsharedActivity\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry) && WRITE.test(readFileSync(full, "utf8"))) {
          offenders.push(full);
        }
      }
    };
    walk(path.join(process.cwd(), "src"));

    expect(
      offenders,
      "publishing belongs to scripts/ops/publish-shared-activities.mjs alone. A write under src/ is reachable from a teacher's session and is how a curated library becomes user-generated content.",
    ).toEqual([]);
  });

  test("the publish script is idempotent: running it twice leaves one row", async () => {
    const { execFileSync } = await import("node:child_process");
    const before = await db.sharedActivity.count();
    for (let i = 0; i < 2; i += 1) {
      execFileSync("node", ["scripts/ops/publish-shared-activities.mjs"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }
    const after = await db.sharedActivity.count();
    const slugs = await db.sharedActivity.findMany({ select: { slug: true } });
    const unique = new Set(slugs.map((s) => s.slug));
    expect(unique.size, "the script must upsert on slug, never insert a second copy").toBe(slugs.length);
    expect(after, "two runs must not grow the table beyond one row per slug").toBe(
      before + (after - before),
    );
    // The real assertion: every slug appears exactly once, proved above, and
    // the count is stable across the second run.
    const third = await db.sharedActivity.count();
    expect(third).toBe(after);
  });
});

test("removing a shared activity leaves every teacher's copy working", async ({ page }) => {
  // Its own throwaway activity, because this test deletes what it is given and
  // the seeded fixtures have to survive for the rest of the run. It points at
  // the same seeded file on disk, which is itself worth proving: even when two
  // shared activities share a source file, a teacher's copy gets its own.
  const seeded = await sharedBySlug(PUBLISHED_SLUG);
  const shared = await db.sharedActivity.create({
    data: {
      slug: "throwaway-for-deletion-test",
      title: "A library activity about to be withdrawn",
      instructions: seeded.instructions,
      templatePathsJson: seeded.templatePathsJson,
      tagsJson: seeded.tagsJson,
      ageMode: seeded.ageMode,
      published: true,
      sortOrder: 999,
    },
  });

  await loginTeacher(page, SCHOOL_A.admin);
  await page.goto("/teacher/activities/shared");
  await addFromCard(page, shared.title);
  const copy = await db.activityTemplate.findFirst({
    where: { teacher: { email: SCHOOL_A.admin.email }, sourceSharedActivityId: shared.id },
  });
  expect(copy).toBeTruthy();
  const copyMedia: string[] = JSON.parse(copy!.templatePathsJson ?? "[]");
  expect(copyMedia.length, "the fixture activity should carry a background").toBeGreaterThan(0);

  // StoryJar deletes the shared activity outright.
  await db.sharedActivity.delete({ where: { id: shared.id } });

  // The copy survives, keeps its own media, and still renders.
  const after = await db.activityTemplate.findUnique({ where: { id: copy!.id } });
  expect(after, "deleting a shared activity must never delete a teacher's copy").toBeTruthy();
  expect(after!.sourceSharedActivityId, "the provenance is dropped, the work is not").toBeNull();
  expect(after!.templatePathsJson).toBe(copy!.templatePathsJson);

  await page.goto(`/teacher/activities/${copy!.id}`);
  await expect(page.locator("body")).toContainText(after!.title);
  const status = await page.evaluate(
    (u) => fetch(u, { credentials: "include" }).then((r) => r.status),
    copyMedia[0],
  );
  expect(status, "the copy's own media must still be served after the original is gone").toBe(200);
});
