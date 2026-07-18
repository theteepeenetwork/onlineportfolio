import { test, expect } from "@playwright/test";
import {
  SCHOOL_A,
  SCHOOL_B,
  loginTeacher,
  loginParent,
  clearSession,
  fetchStatus,
} from "../helpers";

// ===========================================================================
// A1 — Voice notes (AUDIO) are scoped across tenants, exactly like photos
//
// AUDIO is a new capture type: a child records a short voice note that goes
// through the normal approval queue and is stored as a media file served ONLY
// through the authorising /uploads route (SAFEGUARDING.md rules 4 & 7). It must
// be reachable by the child's own teacher and (for APPROVED notes only) the
// linked parent — and by nobody else: no other tenant, no admin who doesn't
// teach the class, no parent for a PENDING note, no anonymous user.
//
// This is the required cross-tenant isolation coverage for the new media type,
// mirroring tenant-isolation.spec.ts for images. Fixtures live in
// prisma/seed-test.ts (School B seeds both an approved and a pending voice note).
// ===========================================================================

test.describe("A1 · Voice-note media route is scoped across tenants (/uploads)", () => {
  const B_APPROVED = SCHOOL_B.approvedAudio; // Zara's approved voice note
  const B_PENDING = SCHOOL_B.pendingAudio; // Yusuf's pending voice note

  test("School B's own teacher can load School B voice notes (approved AND pending)", async ({ page }) => {
    await loginTeacher(page, SCHOOL_B.teacher);
    expect(await fetchStatus(page, B_APPROVED)).toBe(200);
    // The teacher moderates pending work in their own class, so they play it.
    expect(await fetchStatus(page, B_PENDING)).toBe(200);
  });

  test("School A teacher CANNOT load School B voice notes", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect(await fetchStatus(page, B_APPROVED)).toBe(404);
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });

  test("School A admin CANNOT load School B voice notes (admins aren't all-seeing)", async ({ page }) => {
    await loginTeacher(page, SCHOOL_A.admin);
    expect(await fetchStatus(page, B_APPROVED)).toBe(404);
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });

  test("School B's linked parent hears approved-only, never pending", async ({ page }) => {
    await loginParent(page, SCHOOL_B.parentFamilyCode); // Nadia → Zara
    expect(await fetchStatus(page, B_APPROVED)).toBe(200);
    // Rule 3: a pending voice note is invisible even to the child's own parent.
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });

  test("School A's parent CANNOT load School B voice notes", async ({ page }) => {
    await loginParent(page, SCHOOL_A.parentFamilyCode); // Priya (St Bede's)
    expect(await fetchStatus(page, B_APPROVED)).toBe(404);
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });

  test("anonymous is refused every voice note (deny by default)", async ({ page }) => {
    await page.goto("/");
    await clearSession(page);
    expect(await fetchStatus(page, B_APPROVED)).toBe(404);
    expect(await fetchStatus(page, B_PENDING)).toBe(404);
  });
});
