import { test, expect } from "@playwright/test";
import { db } from "@/lib/db";
import { SCHOOL_A, SCHOOL_B, fetchStatus, loginTeacher } from "../helpers";

const PUBLISHED_MEDIA = "/uploads/shared/seed-shared-bg.svg";
const UNPUBLISHED_MEDIA = "/uploads/shared/seed-shared-unpublished-bg.svg";

// ===========================================================================
// The /uploads route, across the widening that the StoryJar shared activity
// library needs.
//
// Shared library media is the first content in this product that is
// deliberately readable by every signed-in teacher. That is a real widening of
// a route whose whole job is refusing, and it has already produced one finding
// (F17, where it authorised path-first rather than across all matching
// records). So the widening is asserted against its control, on the same route,
// in the same file: a teacher must still be unable to load another teacher's
// ordinary template media.
//
// THE CONTROL IS WRITTEN AND PROVED FIRST, before the route is touched at all.
// A control that is only ever seen passing after the change cannot tell you
// whether the change broke it or whether it was never working.
// ===========================================================================

// The "not added" assertions below are about a teacher who has added nothing,
// so the run starts from that state rather than from whatever an earlier spec
// file left behind.
test.beforeEach(async () => {
  await db.activityTemplate.deleteMany({ where: { sourceSharedActivityId: { not: null } } });
});

test("CONTROL: a teacher cannot load another teacher's ordinary template media", async ({ page }) => {
  // School A's admin, asking for School B's teacher-authored template
  // background. Nothing about the shared library may ever make this a 200.
  await loginTeacher(page, SCHOOL_A.admin);
  expect(
    await fetchStatus(page, SCHOOL_B.templateMedia),
    "a teacher reading another tenant's template background is a cross-tenant disclosure",
  ).toBe(404);

  // Positive control on the same route and the same session: a route that has
  // simply stopped serving anything would pass the assertion above.
  await loginTeacher(page, SCHOOL_B.teacher);
  expect(
    await fetchStatus(page, SCHOOL_B.templateMedia),
    "the owning teacher must still be served, or the 404 above proves nothing",
  ).toBe(200);
});

test("a signed-in teacher can load the media of a shared activity they have not added", async ({ page }) => {
  // The widening, stated as its own assertion. A teacher has to be able to see
  // what they are considering, and the library is the first content in this
  // product deliberately readable by every signed-in teacher.
  await loginTeacher(page, SCHOOL_A.admin);
  const added = await db.activityTemplate.count({
    where: { teacher: { email: SCHOOL_A.admin.email }, sourceSharedActivityId: { not: null } },
  });
  expect(added, "this proves the UNADDED case, so the teacher must not have added it").toBe(0);

  expect(await fetchStatus(page, PUBLISHED_MEDIA)).toBe(200);

  // And the same file for the other school's teacher: shared means shared, so a
  // per-tenant answer here would be the bug in the opposite direction.
  await loginTeacher(page, SCHOOL_B.teacher);
  expect(await fetchStatus(page, PUBLISHED_MEDIA)).toBe(200);
});

test("an unpublished shared activity's media is refused to every teacher", async ({ page }) => {
  // Published is not decoration. An activity nobody has published is invisible,
  // and that has to include the files it points at, or the screen is private
  // while its content is not.
  await loginTeacher(page, SCHOOL_A.admin);
  expect(await fetchStatus(page, UNPUBLISHED_MEDIA)).toBe(404);
  // Positive control on the same route and session.
  expect(await fetchStatus(page, PUBLISHED_MEDIA)).toBe(200);
});

test("a signed-out request cannot load shared activity media", async ({ page }) => {
  // Established first, while signed in, so the 404 below cannot be a route that
  // has simply stopped serving.
  await loginTeacher(page, SCHOOL_A.admin);
  expect(await fetchStatus(page, PUBLISHED_MEDIA)).toBe(200);

  await page.context().clearCookies();
  await page.goto("/login/teacher");
  expect(
    await fetchStatus(page, PUBLISHED_MEDIA),
    "the library is for signed-in teachers, not for the public web",
  ).toBe(404);
});

test("a child and a parent are never served library media", async ({ page, context }) => {
  // A class never needs it: adding an activity copies the files into the
  // teacher's own media, so what a child opens is the teacher's copy, authorised
  // by the ordinary rules. Granting it here would widen the route for the two
  // audiences it exists to protect.
  const { loginStudent, loginParent } = await import("../helpers");

  await loginStudent(page, SCHOOL_A.classCode, SCHOOL_A.student);
  expect(await fetchStatus(page, PUBLISHED_MEDIA)).toBe(404);

  await context.clearCookies();
  await loginParent(page, SCHOOL_A.parentFamilyCode);
  expect(await fetchStatus(page, PUBLISHED_MEDIA)).toBe(404);
});
