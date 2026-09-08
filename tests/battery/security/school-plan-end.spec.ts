import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { loginTeacher } from "../helpers";

// ===========================================================================
// When a school plan ends, a teacher gets her own account back — and takes only
// the classes she brought in.
//
// Owner decision, 8 September 2026 (docs/dpo-decisions.md); the rule is
// src/lib/schoolPlanEnd.ts. Before it, a teacher whose school lapsed went
// read-only and STAYED THAT WAY INDEFINITELY, because `joinSchoolPlan` had
// deleted her own FREE subscription and nothing ever gave it back.
//
// THE RULE HAS TWO PATHS TO THE SAME STATE and this file drives both, because
// either one alone would let the other rot:
//
//   • the nightly sweep in scripts/freeze-expired.mjs, run here AS A SUBPROCESS
//     ON A DATABASE OF ITS OWN, which is `urn-released-on-unpaid-freeze.spec.ts`'s
//     pattern and for its reasons — the job is indiscriminate by design, so
//     pointed at the lane's database it would detach staff belonging to specs
//     that have not run yet;
//   • the lazy settle on the teacher's OWN next write, driven through the real
//     product in a browser, because "her next save goes through rather than
//     being refused by the school she has just stopped belonging to" is the part
//     a unit call cannot show.
//
// `settleSchoolPlanEnd` is deliberately not called directly here either. Both
// real paths are driven instead, because a direct call would prove the function
// and not the wiring — and the wiring is where a rule like this dies quietly.
//
// EVERY TEST BUILDS ITS OWN SCHOOL. The trigger is "frozen for longer than the
// retention window", a state no shared fixture is in and none should be pushed
// into — `frozenAt` starts RETENTION.md's deletion clock, and back-dating School
// C would change what every other spec reading a frozen school is looking at.
// ===========================================================================

const DAY = 24 * 60 * 60 * 1000;
const PAST_THE_WINDOW = 400;
const INSIDE_THE_WINDOW = 200;

type World = {
  schoolId: string;
  brought: string; // she arrived with it and still holds it   → hers
  reassigned: string; // she arrived with it, the school moved it → the school's
  schoolOwn: string; // the school's own, handed to her          → the school's
  teacherId: string;
};

/**
 * A school, a teacher who joined it carrying two classes, and a colleague.
 *
 * `frozenDaysAgo: null` means the plan is ACTIVE — the control that proves the
 * job is reading the state rather than detaching everybody it can find.
 */
async function makeWorld(
  db: PrismaClient,
  label: string,
  frozenDaysAgo: number | null,
  opts: { password?: string; broughtIn?: boolean } = {},
): Promise<World> {
  const tag = `${label}-${Math.random().toString(36).slice(2, 8)}`;
  const school = await db.school.create({ data: { name: `Lapse ${tag}`, verifiedAt: new Date() } });
  await db.subscription.create({
    data: {
      kind: "SCHOOL",
      schoolId: school.id,
      status: frozenDaysAgo === null ? "ACTIVE" : "FROZEN",
      frozenAt: frozenDaysAgo === null ? null : new Date(Date.now() - frozenDaysAgo * DAY),
    },
  });
  const teacher = await db.teacher.create({
    data: {
      name: `Joined ${tag}`,
      displayName: "Joined",
      email: `joined-${tag}@lapse.test`,
      passwordHash: opts.password ? await bcrypt.hash(opts.password, 10) : "",
      schoolId: school.id,
      emailConfirmedAt: new Date(),
    },
  });
  const colleague = await db.teacher.create({
    data: { name: `Colleague ${tag}`, displayName: "Colleague", email: `colleague-${tag}@lapse.test`, passwordHash: "", schoolId: school.id },
  });
  const code = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  const mk = (name: string, holder: string, broughtInByTeacherId: string | null) =>
    db.class.create({ data: { name, classCode: code(), teacherId: holder, schoolId: school.id, broughtInByTeacherId } });

  // `broughtIn: false` is the teacher the SCHOOL created: invited, never had an
  // account of her own, so nothing she holds is marked as hers.
  const marked = opts.broughtIn === false ? null : teacher.id;
  const brought = await mk("Brought In", teacher.id, marked);
  const reassigned = await mk("Reassigned", colleague.id, marked);
  const schoolOwn = await mk("School's Own", teacher.id, null);

  return { schoolId: school.id, brought: brought.id, reassigned: reassigned.id, schoolOwn: schoolOwn.id, teacherId: teacher.id };
}

// ---------------------------------------------------------------------------
// The nightly sweep, as a subprocess, on its own database.
// ---------------------------------------------------------------------------

test("the sweep returns each teacher to their own plan with the classes they brought, and leaves the school's alone", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "storyjar-plan-end-"));
  const url = `file:${path.join(dir, "job.db")}`;
  try {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
      timeout: 120_000,
    });
    const db = new PrismaClient({ datasources: { db: { url } } });
    try {
      const lapsed = await makeWorld(db, "lapsed", PAST_THE_WINDOW);
      // THREE CONTROLS, each differing from `lapsed` by ONE fact. A sweep that
      // detached everybody would pass a test that only asserted the first world.
      const stillInside = await makeWorld(db, "inside", INSIDE_THE_WINDOW);
      const notFrozen = await makeWorld(db, "active", null);
      const invited = await makeWorld(db, "invited", PAST_THE_WINDOW, { broughtIn: false });

      // A child and a moment in the class that is about to move, so "nothing is
      // deleted" is counted rather than intended (the F68 assertion's shape).
      const pupil = await db.student.create({ data: { name: "Test Child", classId: lapsed.brought, avatarColor: "#E08A9B" } });
      const moment = await db.journalItem.create({
        data: { type: "TEXT", textContent: "hello", status: "APPROVED", studentId: pupil.id, classId: lapsed.brought, authorRole: "STUDENT" },
      });

      const out = execFileSync("npx", ["tsx", "scripts/freeze-expired.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url },
        encoding: "utf8",
        timeout: 120_000,
      });
      expect(out).toContain("returned");

      // --- The school whose window has closed --------------------------------
      const teacher = await db.teacher.findUniqueOrThrow({ where: { id: lapsed.teacherId } });
      expect(teacher.schoolId, "she is out of the school").toBeNull();
      expect(teacher.role, "rank is not carried between schools").toBe("TEACHER");
      const plan = await db.subscription.findUnique({ where: { teacherId: lapsed.teacherId } });
      expect(plan?.kind).toBe("FREE");
      expect(plan?.status).toBe("ACTIVE");
      // Cleared, or RETENTION.md's deletion clock is still counting down on an
      // account that is writable again.
      expect(plan?.frozenAt).toBeNull();

      expect((await db.class.findUniqueOrThrow({ where: { id: lapsed.brought } })).schoolId).toBeNull();
      expect((await db.class.findUniqueOrThrow({ where: { id: lapsed.brought } })).broughtInByTeacherId).toBeNull();
      // Marked as hers, but the school had moved it to a colleague: control was
      // exercised over it, so it is the school's.
      expect((await db.class.findUniqueOrThrow({ where: { id: lapsed.reassigned } })).schoolId).toBe(lapsed.schoolId);
      expect((await db.class.findUniqueOrThrow({ where: { id: lapsed.schoolOwn } })).schoolId).toBe(lapsed.schoolId);

      // Nothing was deleted.
      expect(await db.student.findUnique({ where: { id: pupil.id } })).not.toBeNull();
      expect(await db.journalItem.findUnique({ where: { id: moment.id } })).not.toBeNull();

      // The controller change is on the record, names no child, and is NOT a
      // `CLASS_ASSIGNED` row — the admin console builds its "you are holding a
      // colleague's class" warning by substring-matching those, and one written
      // here would make that flag say something untrue.
      const rows = await db.auditLog.findMany({ where: { schoolId: lapsed.schoolId } });
      expect(rows.find((r) => r.action === "SCHOOL_PLAN_ENDED_TEACHER_DETACHED")?.detail).toContain("Nothing was deleted");
      expect(rows.filter((r) => r.action === "CLASS_LEFT_SCHOOL").map((r) => r.subjectId)).toEqual([lapsed.brought]);
      expect(rows.some((r) => r.action === "CLASS_ASSIGNED")).toBe(false);

      // --- The three controls, untouched -------------------------------------
      expect((await db.teacher.findUniqueOrThrow({ where: { id: stillInside.teacherId } })).schoolId).toBe(stillInside.schoolId);
      expect((await db.class.findUniqueOrThrow({ where: { id: stillInside.brought } })).schoolId).toBe(stillInside.schoolId);
      expect((await db.teacher.findUniqueOrThrow({ where: { id: notFrozen.teacherId } })).schoolId).toBe(notFrozen.schoolId);

      // A teacher the school created: her account comes back, and no class does.
      expect((await db.teacher.findUniqueOrThrow({ where: { id: invited.teacherId } })).schoolId).toBeNull();
      expect((await db.subscription.findUnique({ where: { teacherId: invited.teacherId } }))?.kind).toBe("FREE");
      for (const id of [invited.brought, invited.reassigned, invited.schoolOwn]) {
        expect((await db.class.findUniqueOrThrow({ where: { id } })).schoolId).toBe(invited.schoolId);
      }
      const invitedRow = await db.auditLog.findFirst({
        where: { schoolId: invited.schoolId, action: "SCHOOL_PLAN_ENDED_TEACHER_DETACHED" },
      });
      expect(invitedRow?.detail).toContain("no classes");

      // --- The colleague, who brought nothing --------------------------------
      // Every member of staff gets their own account back, not only the one who
      // arrived with classes. She holds `reassigned`, which is marked as the
      // FIRST teacher's; the compound condition is what stops it following her
      // out of the school, and this is where that would show up if it did not.
      const colleague = await db.teacher.findFirstOrThrow({
        where: { email: { startsWith: "colleague-lapsed" } },
      });
      expect(colleague.schoolId).toBeNull();
      expect((await db.subscription.findUnique({ where: { teacherId: colleague.id } }))?.kind).toBe("FREE");
      expect((await db.class.findUniqueOrThrow({ where: { id: lapsed.reassigned } })).schoolId).toBe(lapsed.schoolId);

      // --- And it is idempotent ----------------------------------------------
      execFileSync("npx", ["tsx", "scripts/freeze-expired.mjs"], {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url },
        stdio: "pipe",
        timeout: 120_000,
      });
      expect(
        await db.auditLog.count({
          // PER TEACHER, not per school. Every member of staff detaches — the
          // colleague below included — so a school-wide count is a count of
          // people, and asserting it was 1 asserted the wrong thing.
          where: { subjectId: lapsed.teacherId, action: "SCHOOL_PLAN_ENDED_TEACHER_DETACHED" },
        }),
        "a second run must not detach the same teacher twice",
      ).toBe(1);
    } finally {
      await db.$disconnect();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The lazy path, through the real product.
// ---------------------------------------------------------------------------

test("her next save settles it and goes through, instead of being refused by a school she has left", async ({ page }) => {
  const db = new PrismaClient();
  // Her own school, made here and taken away again, so nothing another spec
  // depends on is put into a state it did not ask for.
  const w = await makeWorld(db, "lazy", PAST_THE_WINDOW, { password: "password" });
  const teacher = await db.teacher.findUniqueOrThrow({ where: { id: w.teacherId } });
  try {
    await loginTeacher(page, { email: teacher.email, password: "password" });

    // BEFORE: she belongs to a frozen school, so a save would be refused. This
    // is the state gate, and it is proved by being in it rather than asserted
    // about.
    expect((await db.teacher.findUniqueOrThrow({ where: { id: w.teacherId } })).schoolId).toBe(w.schoolId);

    await page.goto("/teacher/class");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /add a class|new class/i }).first().click();
    await page.getByLabel(/class name/i).fill("After The Plan Ended");
    await page.getByRole("button", { name: /create|add/i }).last().click();
    // `.first()` because the new class appears in the rail AND in the page body;
    // this is only waiting for the write to land, and the assertions that matter
    // are read from the database below.
    await expect(page.getByText("After The Plan Ended").first()).toBeVisible({ timeout: 15_000 });

    // AFTER: the write went through, and it went through because she was
    // detached first — she is on her own plan and the new class is hers, not a
    // dead school's.
    const after = await db.teacher.findUniqueOrThrow({ where: { id: w.teacherId } });
    expect(after.schoolId).toBeNull();
    expect((await db.subscription.findUnique({ where: { teacherId: w.teacherId } }))?.kind).toBe("FREE");
    const made = await db.class.findFirstOrThrow({ where: { teacherId: w.teacherId, name: "After The Plan Ended" } });
    expect(made.schoolId).toBeNull();
    // And the class she brought came with her, while the school's stayed.
    expect((await db.class.findUniqueOrThrow({ where: { id: w.brought } })).schoolId).toBeNull();
    expect((await db.class.findUniqueOrThrow({ where: { id: w.schoolOwn } })).schoolId).toBe(w.schoolId);
  } finally {
    await db.class.deleteMany({ where: { teacherId: w.teacherId } });
    await db.teacher.deleteMany({ where: { OR: [{ schoolId: w.schoolId }, { id: w.teacherId }] } });
    await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
    await db.subscription.deleteMany({ where: { OR: [{ schoolId: w.schoolId }, { teacherId: w.teacherId }] } });
    await db.school.deleteMany({ where: { id: w.schoolId } });
    await db.$disconnect();
  }
});

test("a teacher on her own plan is not shown a school-only section she cannot have", async ({ page }) => {
  // NOT A TIDY-UP. "Messages" shipped in the rail unconditionally on 7 September,
  // so every teacher saw it — including the free ones the feature does not and
  // cannot exist for, who followed it to a screen explaining an absence they had
  // no way to act on. Absent, not disabled, on the same reasoning as
  // `FamilyThread`: "messages are off" is not information a teacher on their own
  // plan needs about their jar.
  await loginTeacher(page, { email: "free.teacher@example.test", password: "password" });
  const rail = page.getByRole("navigation").first();
  await expect(rail.getByRole("link", { name: "Messages" })).toHaveCount(0);
  // The positive control: the sections she DOES have are still there, so this is
  // not passing because the rail failed to render.
  await expect(rail.getByRole("link", { name: "Queue" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Activities" })).toBeVisible();
});
