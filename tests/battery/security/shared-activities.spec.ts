import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { SCHOOL_A, SCHOOL_B, SCHOOL_D, loginTeacher } from "../helpers";
import { canPublish, publishRefusal } from "@/lib/libraryPermission";

// ===========================================================================
// The StoryJar shared activity library.
//
// The owner's three constraints, each turned into an assertion rather than a
// convention:
//
//   1. Curated, not community. Only StoryJar publishes. That used to mean
//      publishing lived entirely in the repository and NO code under src/ could
//      write the table. It now means something narrower and this file says so
//      in both halves of the test below: exactly one named module may write it,
//      and it publishes only for a school whose canPublishToLibrary is set —
//      StoryJar Academy, where StoryJar's own staff work. No teacher at any
//      real school can reach it, and that is now proved at runtime as well as
//      by a scan.
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
  // The one module under src/ allowed to write the shared table. A literal
  // list, the same shape as EXPECTED_IDS in ops-operations.spec.ts, so this
  // goes red in BOTH directions: a second file gaining a write fails, and so
  // does this one losing it.
  const PUBLISHER = "src/lib/libraryPublishing.ts";
  const GATE = "src/lib/libraryPermission.ts";

  const writersUnderSrc = (): string[] => {
    const offenders: string[] = [];
    const WRITE = /\bsharedActivity\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry) && WRITE.test(readFileSync(full, "utf8"))) {
          offenders.push(path.relative(process.cwd(), full));
        }
      }
    };
    walk(path.join(process.cwd(), "src"));
    return offenders.sort();
  };

  // WHAT THIS ASSERTION USED TO SAY, AND WHY IT SAYS LESS NOW.
  //
  // It used to demand zero writes anywhere under src/: publishing was a script
  // run against the repository, so "no teacher may publish" was enforced by
  // there being no such code at all. Publishing now exists in the application,
  // for StoryJar's own staff, so the honest version of the guarantee is
  // narrower — one named module, gated on a flag no screen can write.
  //
  // Be plain about the trade: this is weaker than an absence. What replaces the
  // missing strength is not this scan but the two runtime tests below, which
  // the old assertion could never have written, because there was no action to
  // point them at.
  test("exactly one module under src/ writes the shared table", () => {
    expect(
      writersUnderSrc(),
      `publishing belongs to ${PUBLISHER} and to scripts/ops/publish-shared-activities.mjs. A write anywhere else under src/ is reachable from an ordinary teacher's session and is how a curated library becomes user-generated content.`,
    ).toEqual([PUBLISHER]);
  });

  // The second half, and the one that stops the first being a formality. A
  // module named in an allowlist that had lost its permission check would pass
  // the scan above and publish for anybody.
  test("the writer is gated: every write goes through canPublish", () => {
    const source = readFileSync(path.join(process.cwd(), PUBLISHER), "utf8");

    // The gate is DEFINED in the permission module (which carries no
    // `server-only`, so the tests above can call it for real) and IMPORTED
    // here. Assert both halves: a writer that stopped importing it, or a
    // permission module that stopped exporting it, must fail.
    expect(
      readFileSync(path.join(process.cwd(), GATE), "utf8"),
      `${GATE} must define the permission check. It lives there rather than in the writer so a blocking spec can call it; see that file's header for the mutation test that forced the split.`,
    ).toContain("export async function canPublish(");
    expect(
      source,
      `${PUBLISHER} must import the permission check. Without canPublish() the allowlist entry above says only that the writes are in one place, not that anybody is stopped.`,
    ).toContain("canPublish");

    // Every exported function in the module that reaches a write must ask —
    // DERIVED from the source, not a list somebody keeps up to date. The first
    // version of this test hard-coded two names while the module had three
    // writers, so the third was asserted by nobody.
    const WRITE_IN_FN = /export async function (\w+)\(([\s\S]*?)(?=\nexport |$)/g;
    const writers: string[] = [];
    for (const [, name, body] of source.matchAll(WRITE_IN_FN)) {
      if (/\bsharedActivity\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/.test(body)) {
        writers.push(name);
      }
    }
    expect(writers.length, "the module should still contain writing functions to check").toBeGreaterThan(0);

    for (const fn of writers) {
      const body = source.slice(source.indexOf(`export async function ${fn}(`));
      const upToNextExport = body.slice(0, body.indexOf("\nexport ", 1) + 1 || undefined);
      expect(
        upToNextExport,
        `${fn}() writes the shared table and must call canPublish() before it does.`,
      ).toContain("canPublish(");
    }
  });

  // The state that matters, not the row count. The count is what the first
  // version of these tests asserted, and it would have stayed green through the
  // most damaging thing an ordinary teacher could actually do here: flipping an
  // already-withdrawn activity back to visible, which re-opens its media on the
  // /uploads route. Nothing is created, so nothing is counted.
  const libraryState = async () =>
    JSON.stringify(
      await db.sharedActivity.findMany({
        select: { slug: true, published: true },
        orderBy: { slug: "asc" },
      }),
    );

  test("a teacher at an ordinary school cannot publish, however the form is forged", async ({
    page,
  }) => {
    const before = await libraryState();

    // School A's own template, School A's own session. Nothing borrowed, no id
    // guessed: the most favourable possible case for the attacker, and it is
    // still refused, because the refusal is about the SCHOOL and not about
    // whether they own the row.
    const mine = await db.activityTemplate.findFirst({
      where: { teacher: { email: SCHOOL_A.admin.email } },
      select: { id: true },
    });
    expect(mine, "School A needs at least one template for this to be a real attempt").toBeTruthy();

    await loginTeacher(page, SCHOOL_A.admin);
    await page.goto(`/teacher/activities/${mine!.id}`);

    // The control first: the button is not drawn for them at all.
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem", { name: /Publish to library/i })).toHaveCount(0);

    // BE HONEST ABOUT WHAT THIS TEST CAN AND CANNOT DO. A Server Action is not
    // an ordinary POST endpoint: it is reached by an id Next mints at build
    // time and embeds in the form it rendered, so a spec cannot craft the
    // request without first being served the control. Which is the point — for
    // this teacher there is no control to be served, on any screen. So the
    // reachability proof is three facts together: the button is not drawn (just
    // asserted), the screen behind it does not exist for them (below), and the
    // module that would do the work asks canPublish() first (asserted in its
    // own test above, over the source).
    await page.goto("/teacher/activities/library");
    await expect(
      page.getByRole("heading", { name: "Publishing" }),
      "the publishing screen must 404 for an ordinary school, not merely render empty",
    ).toHaveCount(0);

    expect(
      await libraryState(),
      "a school without canPublishToLibrary changed the library — either a new row, or the visibility of an existing one",
    ).toBe(before);

    // The flag itself is what all of that rests on, so assert it rather than
    // assuming the fixture: if St Bede's ever gained it, every assertion in
    // this test would pass for the wrong reason.
    const theirSchool = await db.teacher.findUnique({
      where: { email: SCHOOL_A.admin.email },
      select: { school: { select: { canPublishToLibrary: true } } },
    });
    expect(theirSchool!.school!.canPublishToLibrary).toBe(false);
  });

  test("School B cannot publish either, and the flagged school can", async ({ page }) => {
    const before = await libraryState();

    await loginTeacher(page, SCHOOL_B.teacher);
    await page.goto("/teacher/activities/library");
    await expect(page.getByRole("heading", { name: "Publishing" })).toHaveCount(0);
    expect(await libraryState()).toBe(before);

    // THE POSITIVE CONTROL, and it is the half that makes the two refusals
    // above mean something. Written second on purpose: a refusal that is only
    // ever seen passing cannot tell you whether the feature works at all.
    await page.context().clearCookies();
    await loginTeacher(page, SCHOOL_D.teacher);

    const theirs = await db.activityTemplate.findFirst({
      where: { teacher: { email: SCHOOL_D.teacher.email } },
      select: { id: true },
    });
    await page.goto(`/teacher/activities/${theirs!.id}`);
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Publish to library/i }).click();
    await page.waitForURL(/\/teacher\/activities\/library/);

    const published = await db.activityTemplate.findUnique({
      where: { id: theirs!.id },
      select: { librarySlug: true },
    });
    expect(published!.librarySlug, "the template should now name the activity it published as").toBeTruthy();

    const row = await db.sharedActivity.findUnique({ where: { slug: published!.librarySlug! } });
    expect(row, "the library row should exist").toBeTruthy();
    expect(row!.origin).toBe("STORYJAR");
    expect(
      row!.published,
      "publishing must NOT make it visible: that is a second, separate act",
    ).toBe(false);

    // The bytes were copied, not the strings. If they were the same file, a
    // future fix to F27 that finally gives template media an erasure path would
    // blank the library activity and every classroom that had added it.
    expect(row!.templatePathsJson).toContain("/uploads/shared/");
    expect(row!.templatePathsJson).not.toContain(SCHOOL_D.templateMedia);

    const sharedPath = (JSON.parse(row!.templatePathsJson!) as string[])[0];

    // Still invisible to a teacher elsewhere, because it is not published — and
    // its media is unreadable for the same reason. The /uploads route answers a
    // shared path only where a PUBLISHED row references it, so "not visible
    // yet" is a fact about the bytes and not only about the browse screen.
    await page.context().clearCookies();
    await loginTeacher(page, SCHOOL_B.teacher);
    await page.goto("/teacher/activities/shared");
    await expect(page.getByText(SCHOOL_D.templateTitle, { exact: false })).toHaveCount(0);
    expect(
      (await page.request.get(sharedPath)).status(),
      "an unpublished activity's media must not be served to anybody",
    ).toBe(404);

    // The second act: making it visible. Now the same teacher, in another
    // school, sees it and can load its background.
    await page.context().clearCookies();
    await loginTeacher(page, SCHOOL_D.teacher);
    await page.goto("/teacher/activities/library");
    await page.getByRole("button", { name: "Make visible" }).first().click();
    await page.waitForURL(/visible=1/);

    await page.context().clearCookies();
    await loginTeacher(page, SCHOOL_B.teacher);
    await page.goto("/teacher/activities/shared");
    await expect(page.getByText(SCHOOL_D.templateTitle, { exact: false })).toHaveCount(1);
    expect((await page.request.get(sharedPath)).status()).toBe(200);

    // Clean up so the idempotence test below still counts what it expects to.
    await db.activityTemplate.update({
      where: { id: theirs!.id },
      data: { librarySlug: null },
    });
    await db.sharedActivity.delete({ where: { slug: published!.librarySlug! } });
  });

  // THE TESTS THAT ACTUALLY HOLD THE GATE UP.
  //
  // Written after a mutation test embarrassed the first version of this file.
  // With all three `canPublish` calls disabled, every runtime test here still
  // passed — because a spec cannot craft a Server Action request (Next rejects
  // the payload before any of our code runs), so nothing was ever reaching the
  // gate to be stopped. They were green for a reason unrelated to security.
  //
  // So the gates were moved into @/lib/libraryPermission, which carries no
  // `server-only`, exactly as src/lib/ops/enabled.ts and dto.ts do and for the
  // same stated reason. These call them with real fixture ids. Disable either
  // gate and these go red, which is the property the file needed and did not
  // have.
  test("canPublish answers per school, and denies by default", async () => {
    const teacherFor = async (email: string) =>
      (await db.teacher.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;

    expect(
      await canPublish(await teacherFor(SCHOOL_D.teacher.email)),
      "the flagged school must be able to publish, or the refusals below prove nothing",
    ).toBe(true);

    for (const email of [SCHOOL_A.admin.email, SCHOOL_A.otherTeacher.email, SCHOOL_B.teacher.email]) {
      expect(await canPublish(await teacherFor(email)), `${email} must not be able to publish`).toBe(
        false,
      );
    }

    // A teacher id that names nobody denies rather than throwing: a crafted
    // request is the case this is for.
    expect(await canPublish("no-such-teacher-id")).toBe(false);
  });

  test("a template pointing at a pupil's work is refused before any byte moves", async () => {
    const publisher = await db.teacher.findUniqueOrThrow({
      where: { email: SCHOOL_D.teacher.email },
      select: { id: true },
    });

    // A real child's media path out of the fixtures — the exact string a
    // teacher would read off an <img src> in their own approval queue.
    const childWork = await db.journalItem.findFirstOrThrow({
      where: { mediaPath: { not: null } },
      select: { mediaPath: true, status: true },
    });

    const refusal = await publishRefusal(publisher.id, {
      templatePathsJson: JSON.stringify([childWork.mediaPath]),
      quizJson: null,
      objectsJson: null,
    });
    expect(
      refusal,
      `a template referencing a pupil's ${childWork.status} work must be refused, not published`,
    ).toContain("pupil");

    // A child's unfinished drawing, which no adult has even seen.
    const childDraft = await db.draft.findFirst({
      where: { studentId: { not: null }, pagesJson: { not: null } },
      select: { pagesJson: true },
    });
    if (childDraft?.pagesJson) {
      const path = (JSON.parse(childDraft.pagesJson) as string[])[0];
      expect(
        await publishRefusal(publisher.id, {
          templatePathsJson: JSON.stringify([path]),
          quizJson: null,
          objectsJson: null,
        }),
      ).toContain("pupil");
    }

    // Another teacher's template background. Not child data, still not ours.
    expect(
      await publishRefusal(publisher.id, {
        templatePathsJson: null,
        quizJson: null,
        objectsJson: JSON.stringify([{ src: SCHOOL_B.templateMedia }]),
      }),
      "somebody else's template picture must be refused too",
    ).toBeTruthy();

    // THE CONTROL. The Academy's own template must still publish, or the three
    // refusals above are indistinguishable from a function that refuses
    // everything.
    expect(
      await publishRefusal(publisher.id, {
        templatePathsJson: JSON.stringify([SCHOOL_D.templateMedia]),
        quizJson: null,
        objectsJson: null,
      }),
      "the publisher's own media must not be refused",
    ).toBeNull();
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
