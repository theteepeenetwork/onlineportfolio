import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginTeacher } from "../helpers";

// ===========================================================================
// When a class changes hands, everything the old teacher held goes with it.
//
// This replaces tests/battery/findings/staff-removal.spec.ts, which asserted
// the intended behaviour and failed on purpose. Two things changed when it
// moved into the blocking suite:
//
//   It drives the REAL ACTION through the console. The findings version
//   simulated the click with `db.teacher.update`, which would have kept passing
//   against a `removeStaff` that changed underneath it — a test of the
//   database, not of the product.
//
//   It covers both triggers. F59 is removal; F66 is the ORDINARY SEPTEMBER
//   HANDOVER, which is the one that was live in the product the whole time and
//   needs nobody removed from anything.
//
// The properties, in the order they matter:
//   1. the classes leave with the school, not with the person (F59)
//   2. the old teacher can no longer reach the children's work (F59)
//   3. the class code no longer works — it is a bearer credential and the only
//      thing that closes it is rotation (F66a)
//   4. NOTHING IS DELETED by a removal, on either branch (F68) — the second
//      test, which is about the branch where the teacher row goes away
//   5. an admin cannot do any of this to another school's staff — the third
//      test. This line described the code correctly for months while no
//      assertion covered it; a header that promises what nothing checks is the
//      same species as a check that cannot fail, and this repo has findings on
//      record about those
// ===========================================================================

const db = new PrismaClient();

test("removing a teacher moves their classes, and the old class code stops working [F59, F66]", async ({
  page,
  browser,
}) => {
  const school = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });
  const admin = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.admin.email } });
  const victim = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.teacher.email } });

  const before = await db.class.findMany({
    where: { teacherId: victim.id },
    select: { id: true, name: true, classCode: true, _count: { select: { students: true } } },
  });
  expect(before.length, "the fixture teacher must hold at least one class").toBeGreaterThan(0);
  const oldCode = before[0].classCode;
  const originals = new Map(before.map((c) => [c.id, c.classCode]));

  try {
    // The real path: sign in as the admin and press the control.
    await loginTeacher(page, SCHOOL_B.admin);
    await page.goto("/admin");
    await page.getByRole("button", { name: new RegExp(`actions for ${victim.name}`, "i") }).click();
    await page.getByRole("menuitem", { name: /remove from school/i }).click();

    // The confirm step says what is about to move, before it moves.
    //
    // "your school's StoryJar", not "StoryJar": removal ends this school's
    // access and leaves the person's own account open on the free plan. What
    // that account is worth is removed-staff-keep-a-free-plan.spec.ts's
    // subject; this line only holds the sentence to the truth.
    await expect(
      page.getByText(/loses access to your school.s StoryJar/i),
      "removal must say what it will do before it does it",
    ).toBeVisible();
    await page.getByRole("menuitem", { name: new RegExp(`yes, remove ${victim.name}`, "i") }).click();
    await page.waitForTimeout(2000);

    // 1. The classes are the school's, held by the admin who removed them.
    const after = await db.class.findMany({
      where: { id: { in: before.map((c) => c.id) } },
      select: { id: true, teacherId: true, classCode: true },
    });
    for (const c of after) {
      expect(c.teacherId, "every class must move to the removing admin").toBe(admin.id);
      expect(
        c.classCode,
        "the class code is a bearer credential and must not survive the handover",
      ).not.toBe(originals.get(c.id));
    }

    // 2. The removed teacher reaches nothing. Fresh context: they still know
    //    their password, which is the case F59 measured.
    const ctx = await browser.newContext();
    const theirs = await ctx.newPage();
    await loginTeacher(theirs, SCHOOL_B.teacher);
    const body = await theirs.locator("body").innerText();
    for (const c of before) {
      expect(body, `a removed teacher still sees "${c.name}"`).not.toContain(c.name);
    }
    await ctx.close();

    // 3. The old code signs nobody in — the property no session or password
    //    handling can reach.
    const anon = await browser.newContext();
    const child = await anon.newPage();
    await child.goto(`/login/student?code=${oldCode}`);
    const codeBody = await child.locator("body").innerText();
    expect(
      codeBody,
      "the old class code still returns a roster, so the removed teacher can sign in as any pupil",
    ).not.toContain(before[0].name);
    await anon.close();
  } finally {
    // Put School B back: its teacher, their classes, and codes the other specs
    // do not depend on (they look classes up by teacher, not by code).
    //
    // Including the free plan the removal now gives them. Oakfield's teacher is
    // seeded with no subscription of their own — the school's governs them — so
    // leaving the restored row behind would be fixture drift: harmless to this
    // spec, but it changes what the next spec finds.
    await db.subscription.deleteMany({ where: { teacherId: victim.id } });
    await db.teacher.update({ where: { id: victim.id }, data: { schoolId: school.id } });
    for (const c of before) {
      await db.class.update({
        where: { id: c.id },
        data: { teacherId: victim.id, classCode: c.classCode },
      });
    }
    // Disconnected here as well as in the second test. Prisma reconnects
    // lazily on the next query, so a whole-file run is unaffected — but running
    // this test alone (`-g`) must not leak the client.
    await db.$disconnect();
  }
});

// ===========================================================================
// F68 · Removing an INVITED colleague who holds a class destroys nothing.
//
// The chain the finding records, four steps that are each reasonable on their
// own: `Class.teacher` is `onDelete: Cascade`, with `Student` and `JournalItem`
// cascading from the class; `assignClassToStaff` has no status filter; the
// console deliberately offers invited staff as class owners, because an admin
// setting up in September wants next term's classes placed before everybody has
// accepted; and `removeStaff`'s INVITED branch was a bare `db.teacher.delete`.
// Assign, then remove, and a class of children's work was gone — silently, with
// no audit row and nothing recoverable, under a confirmation that said the
// classes were moving to the admin.
//
// THE ACCEPTANCE CRITERION IS THE OWNER'S SENTENCE, and it is deliberately
// stronger than "the classes move": *"as long as no work is completely deleted
// in the process."* So this counts classes, pupils, journal items, drafts and
// assignment records either side of the removal and asserts they are EQUAL. A
// test that only checked `Class.teacherId` would pass against a change that
// moved the class and dropped every journal item in it, which is precisely the
// failure this exists to catch.
//
// FIVE COUNTS, NOT THREE, and the last two are the ones a reviewer had to point
// out. `Draft` and `AssignmentStudent` cascade from `Teacher` WITHOUT passing
// through `Class` — a draft is a child's private unfinished work, and an
// assignment record is which children an activity was set to — so a change that
// deleted them would leave the first three counts untouched and this test
// green. Neither is reachable from an INVITED row today, because `inviteStaff`
// refuses an email that already belongs to a teacher and an invited row is
// always freshly created with no password. It stops being unreachable if an
// ESTABLISHED account is ever allowed to carry `status = "INVITED"`, which is
// the shortcut phase 2 of docs/paid-tier-plan.md's runway is designed to avoid
// and which somebody will one day take anyway. These two lines are what will
// tell them.
//
// SO READ A GREEN RUN HONESTLY: those two counts are a TRIPWIRE, not a proof.
// They are unmoved today because this test cannot build an INVITED teacher who
// owns a draft — the product refuses to make one — and fabricating that state at
// the database level would assert a property `removeStaff` does not have
// (`handOverClasses` moves classes; it does not move drafts or templates). What
// they buy is that the day the state becomes buildable, this file goes red
// instead of quietly staying green.
//
// IT BUILDS ITS OWN ROWS. The test above already borrows and restores Oakfield's
// seeded teacher and classes; a second spec doing the same to the same fixtures
// doubles the blast radius when one of them fails halfway. The class, its pupils
// and their work are created here and deleted in the `finally`, so nothing
// seeded is touched and the counts move only by amounts this test knows about.
// ===========================================================================
test("removing an INVITED colleague who holds a class destroys nothing [F68]", async ({ page }) => {
  const school = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });
  const admin = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.admin.email } });

  // Somebody the admin invited last week who has never signed in: no password,
  // so no possibility of them having made any of the work below themselves.
  const invitee = await db.teacher.create({
    data: {
      name: "Corin Vale",
      displayName: "Mr Vale",
      email: `invited.f68.${Date.now()}@example.test`,
      passwordHash: "",
      role: "TEACHER",
      status: "INVITED",
      schoolId: school.id,
    },
  });

  // A real class with real children's work in it, held by the admin to begin
  // with — which is how it comes to be assignable at all.
  const klass = await db.class.create({
    data: { name: "Vale Wrens", ageMode: "KS1", classCode: "F68CLS", teacherId: admin.id },
  });
  const pupils = await Promise.all(
    ["Ivo", "Marnie"].map((name) =>
      db.student.create({ data: { name, classId: klass.id, avatarColor: "#4f46e5" } }),
    ),
  );
  // One approved and one still waiting, because they are stored the same way and
  // a cascade takes no notice of status.
  const work = await Promise.all([
    db.journalItem.create({
      data: {
        type: "TEXT",
        textContent: "I found a snail by the gate.",
        status: "APPROVED",
        authorRole: "STUDENT",
        approvedAt: new Date(),
        studentId: pupils[0].id,
        classId: klass.id,
      },
    }),
    db.journalItem.create({
      data: {
        type: "TEXT",
        textContent: "My tower fell over twice.",
        status: "PENDING",
        authorRole: "STUDENT",
        studentId: pupils[1].id,
        classId: klass.id,
      },
    }),
  ]);

  try {
    await loginTeacher(page, SCHOOL_B.admin);
    await page.goto("/admin");

    // STEP ONE, and the finding is clear that this is supported rather than
    // accidental: give the class to somebody who has not accepted yet.
    await page.getByRole("button", { name: new RegExp(`actions for ${invitee.name}`, "i") }).click();
    await page.getByRole("menuitem", { name: /assign classes/i }).click();
    await page.getByRole("menuitem", { name: klass.name, exact: true }).click();
    await expect
      .poll(
        async () =>
          (await db.class.findUnique({ where: { id: klass.id }, select: { teacherId: true } }))
            ?.teacherId,
        {
          message: "an invited teacher must really be able to hold a class, or there is no bug here",
          timeout: 15_000,
        },
      )
      .toBe(invitee.id);

    // THE COUNTS, taken with everything in place and immediately before the
    // removal. Global rather than scoped to this class: a cascade does not
    // respect a WHERE clause, and the question being asked is whether ANYTHING
    // went.
    const before = {
      classes: await db.class.count(),
      pupils: await db.student.count(),
      work: await db.journalItem.count(),
      // Drafts and assignment records, because the three above do not cover
      // them. `Draft` is a child's private unfinished work by the schema's own
      // words (prisma/schema.prisma:522) and `AssignmentStudent` records which
      // children an activity was set to; both cascade from `Teacher` WITHOUT
      // passing through `Class`, so a change that deleted them would leave every
      // count above untouched. `JournalItem.assignmentId` is SET NULL rather
      // than CASCADE, which is worse for a test than a delete would be: the work
      // survives, its provenance does not, and `work` stays exactly equal.
      drafts: await db.draft.count(),
      setTo: await db.assignmentStudent.count(),
    };

    // STEP TWO: remove them, through the control a head teacher presses.
    await page.goto("/admin");
    await page.getByRole("button", { name: new RegExp(`actions for ${invitee.name}`, "i") }).click();
    await page.getByRole("menuitem", { name: /remove from school/i }).click();

    // The sentence has to promise the right thing, because it is the only
    // warning there is. It used to promise the classes would move while the code
    // deleted them.
    await expect(
      page.getByText(/move to/i).first(),
      "the confirmation must say the classes and the children's work move to the admin",
    ).toBeVisible();
    await expect(
      page.getByText(/the work stays here, with you/i),
      "and it must say so for an invited colleague, whose own account really does go",
    ).toBeVisible();

    await page
      .getByRole("menuitem", { name: new RegExp(`yes, remove ${invitee.name}`, "i") })
      .click();

    // The removal really happened, and took the branch under test: the row goes.
    await expect
      .poll(async () => db.teacher.count({ where: { id: invitee.id } }), {
        message: "the invited teacher's row must be deleted — that is the branch this is about",
        timeout: 15_000,
      })
      .toBe(0);

    // ===== THE OWNER'S CONDITION =====
    // Nothing was deleted in the process. Five counts, unchanged.
    const after = {
      classes: await db.class.count(),
      pupils: await db.student.count(),
      work: await db.journalItem.count(),
      drafts: await db.draft.count(),
      setTo: await db.assignmentStudent.count(),
    };
    //
    // SOFT, so all five report. A hard assertion stops at the first one, and
    // "classes: 12, expected 13" on its own tells whoever is reading it far less
    // than the same line followed by two children and two pieces of work. When
    // this gate goes red the question is how much went, not whether.
    expect.soft(after.classes, "a removal must not delete a class").toBe(before.classes);
    expect.soft(after.pupils, "a removal must not delete a child").toBe(before.pupils);
    expect.soft(after.work, "a removal must not delete a single piece of a child's work").toBe(
      before.work,
    );
    expect
      .soft(after.drafts, "a removal must not delete a child's private unfinished work")
      .toBe(before.drafts);
    expect
      .soft(after.setTo, "a removal must not delete the record of who an activity was set to")
      .toBe(before.setTo);

    // And these rows specifically, so that an accidentally equal total cannot
    // pass: the same class, the same children, the same two pieces of work.
    const survived = await db.class.findUnique({ where: { id: klass.id } });
    expect(survived, "the class itself must still exist").toBeTruthy();
    expect(survived!.teacherId, "and it belongs to the admin who did the removing").toBe(admin.id);
    expect(
      survived!.classCode,
      "the class code is a bearer credential and must rotate here as it does on the other branch",
    ).not.toBe("F68CLS");
    expect(
      await db.student.count({ where: { id: { in: pupils.map((p) => p.id) } } }),
      "both children are still in it",
    ).toBe(2);
    expect(
      await db.journalItem.count({ where: { id: { in: work.map((w) => w.id) } } }),
      "and both pieces of their work — approved and still waiting — survived",
    ).toBe(2);

    // The move is written down. A class changing hands with nothing in the audit
    // log is the other half of what made this silent.
    const recorded = await db.auditLog.findFirst({
      where: { action: "CLASS_ASSIGNED", subjectType: "CLASS", subjectId: klass.id },
      orderBy: { at: "desc" },
    });
    expect(recorded, "the handover must be recorded on this branch too").toBeTruthy();
    expect(recorded!.detail).toContain(invitee.name);
  } finally {
    // Deleting the class cascades its pupils and their work. The teacher row is
    // already gone on a green run; this removes it on a red one.
    await db.auditLog.deleteMany({ where: { subjectId: { in: [klass.id, invitee.id] } } });
    await db.class.deleteMany({ where: { id: klass.id } });
    await db.teacher.deleteMany({ where: { id: invitee.id } });
    await db.$disconnect();
  }
});


// ===========================================================================
// The fifth property in this file's header, which until now was advertised and
// not asserted: AN ADMIN CANNOT REMOVE ANOTHER SCHOOL'S STAFF.
//
// AGENTS.md's convention is that a new endpoint or action taking an id gets a
// cross-tenant isolation test before it ships. `removeStaff` has taken a
// caller-supplied `staffId` since it was written and nothing ever tested the
// scoping — and the property is worth strictly more now than when that header
// line was written, because as of F68 one branch of this action HARD-DELETES A
// TEACHER ROW. A guard that only detached somebody left a mistake recoverable
// by hand; one that deletes does not.
//
// THE FORGERY IS REAL, AND THAT IS THE DIFFERENCE FROM
// staff-invite-isolation.spec.ts. That spec records why it could not forge a
// request: a hand-built POST to /admin is refused by Next before it reaches any
// application code ("Failed to find Server Action" — an action needs a valid
// action id), so an assertion against it would hold against a request that
// could never have done anything. It could not fail.
//
// This one gets past that by tampering with a form the server itself rendered.
// The admin opens the removal confirmation for their own colleague — a genuine
// server-action form carrying a valid action id — and the hidden `staffId` is
// rewritten in the DOM before the button is pressed. The request is well-formed,
// correctly routed and authenticated as a real admin; only the id is a lie.
//
// THE POSITIVE CONTROL IS THE SAME FORGERY, AIMED SOMEWHERE ALLOWED, and that
// is what makes this test about the guard rather than about Next. It plants the
// id of a DIFFERENT School B colleague and watches that colleague — not the one
// named on the button — get deleted. So we know, in this run, that the tampered
// value is the value the server acts on, that the request arrives, and that
// arriving means deletion. The negative then changes exactly one thing: the id
// belongs to another school. Nothing else differs, so nothing else can explain
// the different outcome, and no security guard had to be weakened to prove it.
//
// AND IT ASSERTS THE CONSEQUENCE, NOT THE RESPONSE. `removeStaff` returns void
// and answers a refusal with `redirect("/admin")`, so a refusal and a success
// look identical from the outside — there is no status code or body worth
// reading. What tells them apart is School A afterwards: their teacher still
// there, still in their school, still holding their classes on their original
// codes, and not one class, child or piece of work fewer.
// ===========================================================================
test("an admin cannot remove another school's staff [cross-tenant]", async ({ page }) => {
  const schoolA = await db.school.findFirstOrThrow({ where: { name: { contains: "Bede" } } });
  const schoolB = await db.school.findFirstOrThrow({ where: { name: { contains: "Oakfield" } } });

  // The target: an ordinary teacher at School A who holds classes with children's
  // work in them. Not their admin — the realistic thing to reach for is somebody
  // who holds something.
  const victim = await db.teacher.findFirstOrThrow({
    where: { email: SCHOOL_A.otherTeacher.email },
    include: { classes: { select: { id: true, teacherId: true, classCode: true } } },
  });
  expect(
    victim.classes.length,
    "the School A fixture teacher must hold a class, or there is nothing here to protect",
  ).toBeGreaterThan(0);

  // School A as it stands. Scoped to School A rather than global (unlike the F68
  // test above) because the question here is not "did anything go" but "did the
  // OTHER TENANT lose anything".
  const inA = { teacher: { schoolId: schoolA.id } };
  const before = {
    classes: await db.class.count({ where: inA }),
    pupils: await db.student.count({ where: { class: inA } }),
    work: await db.journalItem.count({ where: { class: inA } }),
  };

  // Decoys of our own at School B, all INVITED so that a successful removal takes
  // the branch that DELETES — the branch with the most to lose. `carrier` only
  // ever supplies the form; `allowed` is what the control forgery aims at.
  const mkDecoy = (tag: string) =>
    db.teacher.create({
      data: {
        name: `Decoy ${tag}`,
        displayName: `Decoy ${tag}`,
        email: `decoy.${tag.toLowerCase()}.${Date.now()}@example.test`,
        passwordHash: "",
        role: "TEACHER",
        status: "INVITED",
        schoolId: schoolB.id,
      },
    });
  const carrier = await mkDecoy("Carrier");
  const allowed = await mkDecoy("Allowed");

  // Open `carrier`'s removal confirmation and plant `staffId` — scoped to the
  // REMOVAL form specifically, by walking up from its own submit button. An open
  // menu on an invited colleague also contains "Resend invite", a second form
  // with a second `staffId`; forging that one is a different action and is
  // staff-invite-isolation.spec.ts's subject. Setting every field on the page
  // would test two things at once and tell us which failed only by accident.
  const plantAndSubmit = async (staffId: string) => {
    await page.goto("/admin");
    await page
      .getByRole("button", { name: new RegExp(`actions for ${carrier.name}`, "i") })
      .click();
    await page.getByRole("menuitem", { name: /remove from school/i }).click();
    const planted = await page.evaluate((forgedId) => {
      const submit = Array.from(document.querySelectorAll("button")).find((b) =>
        /^yes, remove/i.test((b.textContent ?? "").trim()),
      );
      const field = submit
        ?.closest("form")
        ?.querySelector<HTMLInputElement>('input[name="staffId"]');
      if (!field) return 0;
      field.value = forgedId;
      return 1;
    }, staffId);
    expect(
      planted,
      "the removal form's own staffId must be found and rewritten, or nothing forged has been sent",
    ).toBe(1);
    // The button still reads the carrier's name. The screen says one thing and
    // the payload says another, which is what a forged id is.
    await page
      .getByRole("menuitem", { name: new RegExp(`yes, remove ${carrier.name}`, "i") })
      .click();
  };

  try {
    await loginTeacher(page, SCHOOL_B.admin);

    // POSITIVE CONTROL: the same forgery, aimed at a colleague this admin IS
    // allowed to remove. If this does not delete `allowed`, the negative below
    // proves nothing — the forged id would simply not be reaching the action.
    await plantAndSubmit(allowed.id);
    await expect
      .poll(async () => db.teacher.count({ where: { id: allowed.id } }), {
        message:
          "the planted id must be the id the server acts on — otherwise the refusal below is Next dropping the request, not the guard refusing it",
        timeout: 15_000,
      })
      .toBe(0);
    expect(
      await db.teacher.count({ where: { id: carrier.id } }),
      "and the row named on the button must be untouched, which is what makes it a forgery at all",
    ).toBe(1);

    // THE NEGATIVE: one thing changes — the id belongs to School A.
    await plantAndSubmit(victim.id);
    await page.waitForTimeout(2000);

    // ===== THE CONSEQUENCE =====
    const after = await db.teacher.findUnique({
      where: { id: victim.id },
      include: { classes: { select: { id: true, teacherId: true, classCode: true } } },
    });
    expect(
      after,
      "School A's teacher must still exist — the branch this forgery reaches deletes the row",
    ).toBeTruthy();
    expect(after!.schoolId, "and must still belong to School A, not be detached").toBe(schoolA.id);
    expect(
      after!.classes.map((c) => c.id).sort(),
      "and must still hold every class they held",
    ).toEqual(victim.classes.map((c) => c.id).sort());
    for (const cls of after!.classes) {
      expect(cls.teacherId, "no class of School A's may have moved to School B's admin").toBe(
        victim.id,
      );
    }
    expect(
      after!.classes.map((c) => c.classCode).sort(),
      "and no class code may have rotated — every child in that class would be locked out",
    ).toEqual(victim.classes.map((c) => c.classCode).sort());

    // Nothing of School A's went. Counted, rather than inferred from the above.
    expect.soft(await db.class.count({ where: inA }), "School A lost a class").toBe(before.classes);
    expect
      .soft(await db.student.count({ where: { class: inA } }), "School A lost a child")
      .toBe(before.pupils);
    expect
      .soft(
        await db.journalItem.count({ where: { class: inA } }),
        "School A lost a piece of a child's work",
      )
      .toBe(before.work);

    // And it removed nobody at all — not even the decoy whose form carried it. A
    // guard that refused the foreign id but then fell back to the rendered one
    // would be a different bug wearing this test's green tick.
    expect(
      await db.teacher.count({ where: { id: carrier.id } }),
      "the forged request must be refused outright, not redirected onto the row the form named",
    ).toBe(1);

    // Nothing was written down as having happened, because nothing did.
    expect(
      await db.auditLog.count({
        where: { action: "STAFF_REMOVED", subjectType: "TEACHER", subjectId: victim.id },
      }),
      "no audit row may claim School A's teacher was removed",
    ).toBe(0);
  } finally {
    await db.auditLog.deleteMany({ where: { subjectId: { in: [carrier.id, allowed.id] } } });
    await db.teacher.deleteMany({ where: { id: { in: [carrier.id, allowed.id] } } });
    await db.$disconnect();
  }
});
