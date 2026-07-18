import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginTeacher, loginStudent, fetchStatus, SCHOOL_A, SCHOOL_B } from "../helpers";

// ===========================================================================
// F17 (FIXED — regression guard) — /uploads authorises by ALL matching records
//
// canAccess (src/app/uploads/[...path]/route.ts) used to decide on the FIRST
// journal item matching a media path and never fall through to the draft or
// activity-material branches. Two records sharing a path therefore
// mis-authorised each other — a false denial at best, a cross-child disclosure
// at worst. It now scopes ownership into each branch ("is there a record I own
// that references this path?") and grants if ANY branch entitles the requester,
// staying deny-by-default because no branch matches a foreign record.
//
// This suite is BLOCKING (moved here from findings/ per AGENTS.md once fixed):
//   • the collision test proves the fix — it FAILS against the old path-first
//     code and passes now (proved red);
//   • it stays green forever so the short-circuit can't creep back;
//   • the companion invariant (no child media path is shared) is the Option-C
//     belt-and-braces below, which makes the "one file, one record" assumption
//     explicit so a future feature that breaks it fails loudly.
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

// ---- The behaviour that was always correct (kept from the original repro) ----

test("a child set an activity can load its template background [F17 context]", async ({ page }) => {
  await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student);
  expect(await fetchStatus(page, SCHOOL_B.templateMedia)).toBe(200);
});

test("a child's approved media stays owner-scoped across tenants [F17]", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  expect(await fetchStatus(page, SCHOOL_B.templateMedia)).toBe(200);
  // A School A child cannot reach School B's media.
  await loginStudent(page, SCHOOL_A.classCode, SCHOOL_A.student);
  expect(await fetchStatus(page, SCHOOL_B.approvedMedia)).toBe(404);
});

// ---- Option C: the invariant that keeps collisions from happening at all ----

test("no child's media path is shared with another record [F17 / Option C]", async () => {
  // Collect every media path referenced by a child's journal item.
  const items = await db.journalItem.findMany({ select: { id: true, mediaPath: true, mediaPathsJson: true } });
  const childPaths: string[] = [];
  const seen = new Map<string, string>(); // path -> first itemId that used it
  for (const it of items) {
    const paths: string[] = [];
    if (it.mediaPath) paths.push(it.mediaPath);
    if (it.mediaPathsJson) {
      try {
        const arr = JSON.parse(it.mediaPathsJson);
        if (Array.isArray(arr)) for (const p of arr) if (typeof p === "string") paths.push(p);
      } catch {
        /* malformed — nothing to add */
      }
    }
    for (const p of paths) {
      // (a) no two journal items share a path — a child's file is theirs alone.
      const prev = seen.get(p);
      expect(prev, `media path ${p} is on two journal items (${prev} and ${it.id})`).toBeUndefined();
      seen.set(p, it.id);
      childPaths.push(p);
    }
  }

  // (b) no child's file is ALSO teacher-authored activity material.
  for (const p of childPaths) {
    const asTemplate = await db.activityTemplate.findFirst({
      where: { OR: [{ templatePathsJson: { contains: p } }, { quizJson: { contains: p } }, { objectsJson: { contains: p } }] },
      select: { id: true },
    });
    expect(asTemplate, `child media ${p} is also a template file (${asTemplate?.id})`).toBeNull();
    const asAssignment = await db.assignment.findFirst({
      where: { OR: [{ templateSnapshotJson: { contains: p } }, { quizSnapshotJson: { contains: p } }, { objectsSnapshotJson: { contains: p } }] },
      select: { id: true },
    });
    expect(asAssignment, `child media ${p} is also an assignment snapshot file (${asAssignment?.id})`).toBeNull();
  }
});

// ---- The fix itself: a shared path is authorised by ALL its owners ----

test("a colliding path is authorised by each owner, denied to strangers [F17]", async ({ page }) => {
  // Manufacture the collision the fixture used to have: point a School A child's
  // journal item at a file that is ALSO School B's teacher-authored template
  // background. (Production can't do this — uploads get random names — so we
  // build it here and tear it down after.)
  const sunflower = await db.class.findUnique({ where: { classCode: SCHOOL_A.classCode }, include: { students: true } });
  const amara = sunflower?.students.find((s) => s.name === SCHOOL_A.student);
  if (!sunflower || !amara) throw new Error("Sunflower/Amara fixture missing");

  const collision = await db.journalItem.create({
    data: {
      type: "PHOTO",
      authorRole: "STUDENT",
      status: "APPROVED",
      mediaPath: SCHOOL_B.templateMedia, // the shared path
      studentId: amara.id,
      classId: sunflower.id,
    },
    select: { id: true },
  });

  try {
    // School B's teacher OWNS the template that uses this file. Under the old
    // path-first code the School A journal item short-circuited and they got a
    // 404 for their own material; now the template branch is still reached. (This
    // is the assertion that fails against the pre-fix code — proved red.)
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, SCHOOL_B.templateMedia)).toBe(200);

    // A teacher who owns NEITHER the journal item's class NOR the template is
    // still denied — the collision doesn't hand a stranger anything.
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, SCHOOL_B.templateMedia)).toBe(404);
  } finally {
    await db.journalItem.delete({ where: { id: collision.id } });
  }
});
