import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// An admin may only invite, and re-invite, staff of their OWN school.
//
// AGENTS.md's convention: a new endpoint or action taking an id gets a
// cross-tenant isolation test before it ships. `resendInvite` has taken a
// caller-supplied staffId since it was written, but until today it was a
// documented no-op that refreshed the page — so there was nothing to isolate,
// and `grep -rn resendInvite tests/` returned nothing.
//
// As of F61 it EMITS A LIVE PASSWORD-SETTING CREDENTIAL to that person's inbox.
// That is a different action wearing the same name, and it needs the test the
// convention asks for.
// ===========================================================================

const db = new PrismaClient();

test("resending an invitation is scoped to the admin's own school [F61]", async ({ page }) => {
  const schoolA = await db.school.findFirstOrThrow({ where: { name: { contains: "Bede" } } });
  const schoolB = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });

  const mkInvited = (schoolId: string, tag: string) =>
    db.teacher.create({
      data: {
        name: `Invited ${tag}`,
        displayName: `Invited ${tag}`,
        email: `invited.${tag}.${Date.now()}@example.test`,
        passwordHash: "",
        role: "TEACHER",
        status: "INVITED",
        schoolId,
      },
    });

  const mine = await mkInvited(schoolB.id, "Mine");
  const theirs = await mkInvited(schoolA.id, "Theirs");

  try {
    await loginTeacher(page, SCHOOL_B.admin);
    await page.goto("/admin");

    // POSITIVE CONTROL FIRST, and it is what makes the negative mean anything.
    //
    // The first version of this test posted a forged FormData to /admin and
    // asserted no token appeared. Next refused the request outright ("Failed to
    // find Server Action" — an action needs a valid action id), so the
    // assertion held against a request that could never have minted anything.
    // It could not fail. Driving the real control proves the mechanism works
    // before asking whether it is scoped.
    await page.getByRole("button", { name: new RegExp(`actions for ${mine.name}`, "i") }).click();
    await page.getByRole("menuitem", { name: /resend invite/i }).click();
    await page.waitForTimeout(1500);
    expect(
      await db.teacherPasswordToken.count({ where: { teacherId: mine.id } }),
      "resending for the admin's OWN invited staff must mint a link, or the negative below proves nothing",
    ).toBeGreaterThan(0);

    // THE NEGATIVE. School A's invited teacher is not on this console at all,
    // so there is no control to press and no id to supply: the isolation is
    // that the row is unreachable, not that a guard refuses it afterwards.
    // (The server-side guard exists too — a schoolId-scoped findFirst — and is
    // what would catch a forged id if Next ever accepted one.)
    const body = await page.locator("body").innerText();
    expect(body, "another school's staff must not appear on this console").not.toContain(theirs.name);
    expect(
      await page.getByRole("button", { name: new RegExp(`actions for ${theirs.name}`, "i") }).count(),
      "no control exists for another school's staff",
    ).toBe(0);
    expect(
      await db.teacherPasswordToken.count({ where: { teacherId: theirs.id } }),
      "no credential was minted for another school's teacher",
    ).toBe(0);
  } finally {
    for (const t of [mine, theirs]) {
      await db.teacherPasswordToken.deleteMany({ where: { teacherId: t.id } });
      await db.teacher.delete({ where: { id: t.id } });
    }
    await db.$disconnect();
  }
});
