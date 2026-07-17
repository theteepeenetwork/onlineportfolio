import { test, expect } from "@playwright/test";
import { loginTeacher, loginStudent, fetchStatus, SCHOOL_A, SCHOOL_B } from "../helpers";

// ===========================================================================
// F17 (OPEN — report-only) — /uploads authorises PATH-FIRST
//
// canAccess (src/app/uploads/[...path]/route.ts) looks up the FIRST journalItem
// matching a media path and decides on that item alone:
//
//     const item = await db.journalItem.findFirst({ where: { OR: [{ mediaPath: urlPath }, …] } });
//     if (item) { …decide…; return false; }      // ← never falls through
//
// So if two records ever share a media path, one of them is authorised against
// the other's owner. It bit us as a DENIAL, which is the safe direction: the
// demo seed used one file as both a template background and five children's
// response media, so a child set an activity got 404 for the worksheet they
// were meant to draw on — an invisible empty box (alt="") that no gate caught.
//
// WHY THIS IS ONLY LOGGED, NOT FIXED:
//
//   1. Production cannot currently collide. savePhoto / saveImageDataUrl mint a
//      random 12-byte filename per upload, so two records never share a path.
//      This was the FIXTURE modelling something the app doesn't do.
//   2. The short-circuit is a deny-by-default decision (rule 8). Making it fall
//      through to the template branch LOOSENS an authorisation path — that is a
//      safeguarding change needing review, not a fix to slip into a seed PR
//      under pressure to make some 404s go away.
//
// The seed fix removes the collision so the child-facing feature works. This
// spec documents the underlying behaviour so nobody re-derives it from scratch,
// and so the day something DOES share a path — a dedupe-by-hash, say, or media
// copied between records — it is already written down.
// ===========================================================================

test("a child set an activity can load its template background [F17 context]", async ({ page }) => {
  // Passes now the fixture collision is gone. It would 404 if a template
  // background ever shared a path with a child's response media again.
  await loginStudent(page, SCHOOL_B.classCode, SCHOOL_B.student);
  expect(await fetchStatus(page, SCHOOL_B.templateMedia)).toBe(200);
});

test("path-first: authorisation follows the FIRST matching item [F17]", async ({ page }) => {
  // The teacher who owns the template can load its background.
  await loginTeacher(page, SCHOOL_B.teacher);
  expect(await fetchStatus(page, SCHOOL_B.templateMedia)).toBe(200);

  // A child's response media stays owner-scoped — the deny-by-default branch
  // this short-circuit implements, which is why it is not casually loosened.
  await loginStudent(page, SCHOOL_A.classCode, SCHOOL_A.student);
  expect(await fetchStatus(page, SCHOOL_B.approvedMedia)).toBe(404);
});
