import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B } from "../helpers";

// ===========================================================================
// A class belongs to its SCHOOL, not only to whoever happens to hold it.
//
// `Class.schoolId` landed on 2026-09-08 with year-end transfer
// (docs/paid-tier-plan.md item 1, docs/dpo-decisions.md 8 Sep 2026). Until it
// did, a class belonged to a school only through its teacher — the same fact
// FINDINGS F59 was about on the removal side — and "the classes she brought in
// leave with her, the ones the school gave her stay" could not be expressed at
// all.
//
// WHAT THIS FILE IS FOR, and it is not "the column exists". Prisma will tell
// you that. These assertions are about the three things the column has to be
// TRUE OF before anything is built on it:
//
//   1. Every class of a real school carries its school, and a free teacher's
//      class carries none. A fixture that gets this wrong makes every later
//      custody test meaningless, because NULL and "the school's" would look the
//      same.
//   2. `broughtInByTeacherId` is written by ONE caller and means one thing. It
//      is empty on every seeded class, because none of them arrived with a
//      teacher who joined — and a value appearing here without `joinSchoolPlan`
//      running is the drift this asserts against.
//   3. Deleting a school does NOT take its classes, pupils or work. The
//      relation is `onDelete: SetNull`, and Cascade would be F68 one size
//      larger: a School row able to delete a school's every class, child and
//      photograph. The migration proves this on a scratch database with
//      `PRAGMA foreign_keys = ON`; this proves it against the database the
//      product actually runs on, where the pragma is Prisma's to set and not
//      ours to assume.
//
// Nothing here drives the UI, because there is no UI for it yet: the column is
// the substrate the rollover pane and the lapse detach are built on, and it
// ships one PR ahead of both so that neither lands its own foundations.
// ===========================================================================

const db = new PrismaClient();

test("every school's class carries its school, and a free teacher's carries none", async () => {
  const stBedes = await db.school.findFirstOrThrow({ where: { name: { contains: "Bede" } } });
  const oakfield = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });

  // Named rather than counted: a count passes while pointing at the wrong rows.
  const sunflower = await db.class.findFirstOrThrow({ where: { classCode: SCHOOL_A.classCode } });
  expect(sunflower.schoolId).toBe(stBedes.id);

  const acorn = await db.class.findFirstOrThrow({ where: { classCode: SCHOOL_B.classCode } });
  expect(acorn.schoolId).toBe(oakfield.id);

  // The control case. Ms Blake has no school, so her class has none, and NULL
  // here is a complete answer rather than a fixture somebody forgot.
  const bluebell = await db.class.findFirstOrThrow({ where: { classCode: "BLUE33" } });
  expect(bluebell.schoolId).toBeNull();
  const blakeTeacher = await db.teacher.findUniqueOrThrow({ where: { id: bluebell.teacherId } });
  expect(blakeTeacher.schoolId).toBeNull();

  // And the general rule, over every seeded row: a class's school is its
  // holder's school, whatever that is. This is the invariant the backfill in
  // the migration establishes and every writer has to preserve.
  const classes = await db.class.findMany({ include: { teacher: { select: { schoolId: true } } } });
  expect(classes.length).toBeGreaterThan(5);
  for (const klass of classes) {
    expect(
      klass.schoolId,
      `class ${klass.classCode} is held by a teacher whose school is ${klass.teacher.schoolId}`,
    ).toBe(klass.teacher.schoolId);
  }
});

test("broughtInByTeacherId is empty until a teacher joins a school with classes", async () => {
  // `joinSchoolPlan` is its only writer. No seeded teacher joined a school
  // carrying classes, so every row is null — and a non-null value appearing
  // here is a second writer having been added without the schema comment being
  // read, which is exactly what that comment asks this test to catch.
  const marked = await db.class.findMany({
    where: { broughtInByTeacherId: { not: null } },
    select: { classCode: true, broughtInByTeacherId: true },
  });
  expect(marked).toEqual([]);
});

test("deleting a school leaves its classes, pupils and work exactly where they are", async () => {
  // A throwaway school of its own, so nothing here can touch a fixture another
  // spec depends on. The whole point of the assertion is the delete, so it must
  // be a school this test created.
  const school = await db.school.create({ data: { name: "Deletion Proof Primary" } });
  const teacher = await db.teacher.create({
    data: {
      name: "Test Holder",
      displayName: "Test Holder",
      email: `holder-${Date.now()}@deletion-proof.test`,
      passwordHash: "",
      schoolId: school.id,
    },
  });
  const klass = await db.class.create({
    data: { name: "Proof Class", classCode: `PRF${Date.now() % 100000}`, teacherId: teacher.id, schoolId: school.id },
  });
  const pupil = await db.student.create({ data: { name: "Test Child", classId: klass.id, avatarColor: "#E08A9B" } });
  const moment = await db.journalItem.create({
    data: { type: "TEXT", textContent: "hello", status: "APPROVED", studentId: pupil.id, classId: klass.id, authorRole: "STUDENT" },
  });

  await db.school.delete({ where: { id: school.id } });

  // The class survives, and has simply stopped belonging to a school.
  const after = await db.class.findUnique({ where: { id: klass.id } });
  expect(after, "the class was deleted with its school — the relation is Cascade, not SetNull").not.toBeNull();
  expect(after?.schoolId).toBeNull();
  // And so does everything hanging off it. This is the assertion that would
  // have caught F68 if it had existed one size smaller.
  expect(await db.student.findUnique({ where: { id: pupil.id } })).not.toBeNull();
  expect(await db.journalItem.findUnique({ where: { id: moment.id } })).not.toBeNull();

  // Tidy up through the teacher, whose cascade is deliberately the one that
  // DOES take a class with it.
  await db.teacher.delete({ where: { id: teacher.id } });
});
