import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Bramblewood Primary — the user-tester team's own school.
//
// NOT Storyjar Academy (scripts/ops/seed-academy.mjs). That one is a real
// tenant in the production database — the sandbox Storyjar's own staff work in,
// with sixteen classes and 436 children — and nothing here may touch it. This
// is a fixture in the local battery database, sitting alongside St Bede's,
// Oakfield and Larchwood, and it exists to be taken apart.
//
// WHY THE TESTERS NEED THEIR OWN SCHOOL
//
// The personas (tests/battery/personas/) do not read the product, they USE it:
// they invite and remove staff, delete classes, return work with feedback,
// rotate codes, hand pupils on to the next year and cancel things. Every one of
// those is a write, and several are destructive. Pointed at St Bede's or
// Oakfield they would quietly dismantle the fixtures the security and a11y
// gates depend on, and the first symptom would be an unrelated suite going red.
//
// So they get a fourth school of their own, appended after the two-tenant
// fixtures, with everything a full journey needs already in place:
//
//   - the three registers (EYFS / KS1 / KS2), because what a child sees is
//     decided by their class's age mode and a tester who only ever sees KS1
//     never tests two thirds of the child-facing product;
//   - a second teacher, so "hand this class to a colleague" and "reassign for
//     September" have somewhere to go;
//   - staff in every state (admin, teacher, TA, invited, and one who is there
//     to be removed);
//   - work in every state (approved, waiting, returned with a note), so the
//     approval queue, the redo flow and the parent view all have something real;
//   - a live activity and a live QUIZ per register, so a child persona can be
//     tested independently of whether the teacher persona ran first;
//   - two parents: one with children in two classes (the sibling switcher), one
//     whose access exists to be taken away.
//
// A tester environment that shares fixtures with a gate is not an environment,
// it is a landmine. This is the whole reason this file exists.
//
// Everything here is FICTIONAL, and every address is on a .test domain, which
// can never resolve or receive mail (RFC 2606). Run after prisma/seed-test.ts:
//
//     npm run db:seed:test && npm run db:seed:personas
//
// or let the battery's global setup do both.
// ---------------------------------------------------------------------------

// Same production guard as the other seeds, one step stricter in intent: this
// one writes staff, children and parents that a persona will later DELETE.
if (process.env.NODE_ENV === "production") {
  console.error("[seed-personas] refusing to run: NODE_ENV is production.");
  console.error("[seed-personas] These fixtures exist to be deleted by automated testers.");
  process.exit(1);
}

const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), ".media");

// Distinct pictures, so a tester looking at a screen can tell which fixture it
// came from. Each file is written ONCE and referenced by exactly one record —
// the no-shared-media-path invariant the other seeds keep (see seed-test.ts).
const LEAF = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#F7F3E8"/><path d="M200 40c60 40 90 110 60 180-50 40-120 20-140-40-15-50 20-110 80-140z" fill="#5B8C5A"/><path d="M200 40C190 120 180 200 150 260" stroke="#38602F" stroke-width="6" fill="none"/></svg>`;
const DUCK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#EAF4F1"/><ellipse cx="200" cy="190" rx="90" ry="60" fill="#F0C24B"/><circle cx="270" cy="130" r="42" fill="#F0C24B"/><circle cx="284" cy="122" r="6" fill="#2B2B2B"/><path d="M306 132h40l-40 22z" fill="#E07A3F"/></svg>`;
const POND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#FFFDF7"/><ellipse cx="200" cy="210" rx="150" ry="60" fill="#BEE0EA"/><circle cx="120" cy="90" r="40" fill="#F6D66B"/></svg>`;

function svg(name: string, body: string) {
  writeFileSync(path.join(MEDIA_DIR, name), body);
  return `/uploads/${name}`;
}

// The whole roster in one place, so the persona specs and this file cannot
// drift apart. Mirrored in tests/battery/personas/world.ts.
const PASSWORD = "password"; // fictional fixtures; the same convention as every other seed

async function main() {
  const db = new PrismaClient();
  mkdirSync(MEDIA_DIR, { recursive: true });

  // Idempotent, and keyed on the things that are actually unique.
  //
  // Staff go first and are matched by ADDRESS, not by school: a persona can
  // rename the school, move a teacher, or (as one of them does) delete a staff
  // row, and a cleanup that only knows the school name then leaves a teacher
  // behind whose email collides on the next run. Their classes, pupils, moments
  // and templates cascade from the teacher row.
  await db.teacher.deleteMany({ where: { email: { endsWith: "@bramblewood.test" } } });
  await db.school.deleteMany({ where: { name: "Bramblewood Primary" } });
  // Parents belong to no school, so they are removed by their family codes.
  await db.parent.deleteMany({ where: { familyCode: { in: ["BRAM01", "BRAM02"] } } });

  console.log("[seed-personas] Appending Bramblewood Primary (the tester team's school) …");

  // `verifiedAt` is set explicitly, and every seed has to do it. Seeds run under
  // `prisma db push`, which builds the schema directly and NEVER applies
  // migrations, so 20260902090000_school_claim's backfill does not reach a
  // seeded database. A fixture school with a null `verifiedAt` would silently
  // lose class reassignment, staff removal and admin promotion, and the failure
  // would surface three suites away from the seed that caused it.
  const school = await db.school.create({ data: { name: "Bramblewood Primary", verifiedAt: new Date() } });

  // A live, paid, whole-school subscription. The personas need an account where
  // nothing is blocked by billing, because "frozen" already has a fixture of its
  // own (School C) and a tester who cannot tell the two apart reports the wrong
  // fault.
  await db.subscription.create({
    data: {
      kind: "SCHOOL",
      status: "ACTIVE",
      schoolId: school.id,
      currentPeriodEnd: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
    },
  });

  const hash = await bcrypt.hash(PASSWORD, 10);

  await db.teacher.create({
    data: {
      name: "Marina Hartley",
      title: "Mrs",
      displayName: "Mrs Hartley",
      email: "head@bramblewood.test",
      passwordHash: hash,
      role: "ADMIN",
      status: "ACTIVE",
      schoolId: school.id,
    },
  });

  const reeves = await db.teacher.create({
    data: {
      name: "Nathan Reeves",
      title: "Mr",
      displayName: "Mr Reeves",
      email: "reeves@bramblewood.test",
      passwordHash: hash,
      role: "TEACHER",
      status: "ACTIVE",
      schoolId: school.id,
    },
  });

  const osei = await db.teacher.create({
    data: {
      name: "Adjoa Osei",
      title: "Miss",
      displayName: "Miss Osei",
      email: "osei@bramblewood.test",
      passwordHash: hash,
      role: "TEACHER",
      status: "ACTIVE",
      schoolId: school.id,
    },
  });

  // A teaching assistant: the role with the least tested permissions in the
  // product, and the one most likely to be given a tablet and left to it.
  await db.teacher.create({
    data: {
      name: "Sam Pike",
      displayName: "Sam",
      email: "ta@bramblewood.test",
      passwordHash: hash,
      role: "TA",
      status: "ACTIVE",
      schoolId: school.id,
    },
  });

  // Invited and never activated — the staff row an admin persona removes. It has
  // no password, which is exactly the state a real "sent the invite to the wrong
  // address" mistake leaves behind.
  await db.teacher.create({
    data: {
      name: "Chris Vale",
      displayName: "Chris",
      email: "chris.vale@bramblewood.test",
      passwordHash: "",
      role: "TEACHER",
      status: "INVITED",
      schoolId: school.id,
    },
  });

  // -------------------------------------------------------------------------
  // Classes: one per register, so every child-facing shell is reachable.
  // -------------------------------------------------------------------------
  const ducklings = await db.class.create({
    data: { name: "Ducklings", yearGroup: "Reception", ageMode: "EYFS", classCode: "DUCK01", teacherId: reeves.id },
  });
  const robins = await db.class.create({
    data: { name: "Robins", yearGroup: "Year 2", ageMode: "KS1", classCode: "ROBN01", teacherId: reeves.id },
  });
  const herons = await db.class.create({
    data: { name: "Herons", yearGroup: "Year 6", ageMode: "KS2", classCode: "HERN01", teacherId: reeves.id },
  });
  // Miss Osei's class: the other side of "hand this class over" and "move the
  // year group on".
  const kestrels = await db.class.create({
    data: { name: "Kestrels", yearGroup: "Year 1", ageMode: "KS1", classCode: "KEST01", teacherId: osei.id },
  });
  // Exists to be deleted by the admin persona. Deleting a class with a child and
  // a moment in it is the destructive path that matters; an empty one proves
  // nothing.
  const spare = await db.class.create({
    data: { name: "Wrens (old)", yearGroup: "Year 3", ageMode: "KS1", classCode: "WREN01", teacherId: reeves.id },
  });

  const COLOURS = ["#F2B5A0", "#A8CBB7", "#F5D08A", "#B7C7E8", "#E4B7D4", "#9FC8C8"];
  const pupils = async (klass: { id: string }, names: string[]) =>
    Promise.all(
      names.map((name, i) =>
        db.student.create({ data: { name, classId: klass.id, avatarColor: COLOURS[i % COLOURS.length] } }),
      ),
    );

  // Only the children that later rows point at are bound to a name; the rest of
  // each class exists to make the register a realistic size (a class of two is
  // not a class, and a queue with one row in it hides every layout problem a
  // real one has).
  const [bo] = await pupils(ducklings, ["Bo", "Pip", "Sky"]);
  const [nell, otis] = await pupils(robins, ["Nell", "Otis", "Rae", "Tia", "Vik", "Wes"]);
  const [wren] = await pupils(herons, ["Wren", "Xan", "Yara", "Zeb"]);
  await pupils(kestrels, ["Ada", "Bex", "Cal"]);
  const [quill] = await pupils(spare, ["Quill"]);

  // -------------------------------------------------------------------------
  // Parents. One with children in two classes (the sibling switcher, and the
  // case where the two children are in different registers); one that exists to
  // have its access removed.
  // -------------------------------------------------------------------------
  await db.parent.create({
    data: {
      name: "Dani Brambles",
      email: "dani.brambles@bramblewood.test",
      familyCode: "BRAM01",
      children: { connect: [{ id: nell.id }, { id: wren.id }] },
    },
  });
  await db.parent.create({
    data: {
      name: "Jo Fields",
      email: "jo.fields@bramblewood.test",
      familyCode: "BRAM02",
      children: { connect: [{ id: bo.id }] },
    },
  });

  // -------------------------------------------------------------------------
  // Work, in every state a screen can show. The queue must not be empty (a
  // teacher persona clearing an empty queue proves nothing), the parent must
  // have something to look at, and one piece must already be RETURNED so the
  // "do it again" journey exists without depending on the teacher persona
  // having run first.
  // -------------------------------------------------------------------------
  const skills = await db.skill.findMany({ take: 2, select: { id: true } });

  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "My minibeast hunt",
      mediaPath: svg("bram-nell-minibeast.svg", LEAF),
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: nell.id,
      classId: robins.id,
      praiseNote: "You looked really carefully at the legs.",
      stickersJson: JSON.stringify(["star", "wow"]),
      skills: skills.length ? { connect: skills.map((s) => ({ id: s.id })) } : undefined,
    },
  });

  await db.journalItem.create({
    data: {
      type: "TEXT",
      caption: "What I found",
      textContent: "I found a woodlouse under the log and it had lots of legs.",
      status: "PENDING",
      authorRole: "STUDENT",
      studentId: nell.id,
      classId: robins.id,
    },
  });

  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "Otis's pond picture",
      mediaPath: svg("bram-otis-pond.svg", POND),
      status: "PENDING",
      authorRole: "STUDENT",
      studentId: otis.id,
      classId: robins.id,
    },
  });

  // Already sent back, with a note. The child persona picks this up and has
  // another go — the half of the feedback loop that is never tested because it
  // needs a teacher to have acted first.
  await db.journalItem.create({
    data: {
      type: "TEXT",
      caption: "My method",
      textContent: "I did it in my head.",
      status: "RETURNED",
      returnMode: "CONTINUE",
      teacherNote: "Can you show me each step you took? Write the numbers you used.",
      authorRole: "STUDENT",
      studentId: wren.id,
      classId: herons.id,
    },
  });

  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "Wren's river study",
      mediaPath: svg("bram-wren-river.svg", POND),
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: wren.id,
      classId: herons.id,
    },
  });

  // A sticker that has arrived and not yet been hearted back: the EYFS child's
  // payoff screen, which only renders in this exact state.
  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "My duck",
      mediaPath: svg("bram-bo-duck.svg", DUCK),
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: bo.id,
      classId: ducklings.id,
      stickersJson: JSON.stringify(["star"]),
      praiseNote: "What a lovely duck, Bo.",
    },
  });

  await db.journalItem.create({
    data: {
      type: "PHOTO",
      caption: "Our class tree",
      mediaPath: svg("bram-quill-tree.svg", LEAF),
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "TEACHER",
      studentId: quill.id,
      classId: spare.id,
    },
  });

  // -------------------------------------------------------------------------
  // The activity library, and one LIVE run per register — including a quiz.
  //
  // A child persona must be able to complete an activity without a teacher
  // persona having gone first, or the two suites become one long chain in which
  // the first failure hides everything after it.
  // -------------------------------------------------------------------------
  const folder = await db.folder.create({
    data: { name: "Autumn term", color: "#F0B441", teacherId: reeves.id },
  });

  const minibeast = await db.activityTemplate.create({
    data: {
      title: "Minibeast hunt",
      instructions: "Draw one minibeast you found. Label how many legs it has.",
      templatePathsJson: JSON.stringify([svg("bram-tmpl-minibeast.svg", LEAF)]),
      tagsJson: JSON.stringify(["Science", "Autumn"]),
      teacherId: reeves.id,
      folderId: folder.id,
    },
  });

  // The quiz, authored the way the editor stores one: floating question boxes in
  // QUIZ_W×QUIZ_H model space, options carrying pictures for children who cannot
  // yet read the answers (src/lib/quiz.ts).
  const quizDuckA = svg("bram-quiz-duck-a.svg", DUCK);
  const quizDuckB = svg("bram-quiz-duck-b.svg", POND);
  const ducksQuiz = await db.activityTemplate.create({
    data: {
      title: "Count the ducks",
      instructions: "Tap the picture with three ducks.",
      templatePathsJson: JSON.stringify([svg("bram-tmpl-pond.svg", POND)]),
      quizJson: JSON.stringify({
        questions: [
          {
            id: "q1",
            pageIndex: 0,
            x: 120,
            y: 120,
            w: 520,
            h: 260,
            prompt: "Which pond has three ducks?",
            options: [
              { id: "opt0", text: "This one", imagePath: quizDuckA },
              { id: "opt1", text: "That one", imagePath: quizDuckB },
            ],
            correctOptionId: "opt0",
          },
          {
            id: "q2",
            pageIndex: 0,
            x: 120,
            y: 420,
            w: 520,
            h: 200,
            prompt: "How many ducks are yellow?",
            options: [
              { id: "opt0", text: "One" },
              { id: "opt1", text: "Two" },
              { id: "opt2", text: "Three" },
            ],
            correctOptionId: "opt2",
          },
        ],
      }),
      tagsJson: JSON.stringify(["Number"]),
      teacherId: reeves.id,
    },
  });

  const method = await db.activityTemplate.create({
    data: {
      title: "Explain your method",
      instructions: "Write how you worked out the answer, step by step.",
      tagsJson: JSON.stringify(["Maths"]),
      teacherId: reeves.id,
    },
  });

  // An archived template, so the library's filters have both states to show.
  await db.activityTemplate.create({
    data: {
      title: "Summer term: pond dipping",
      instructions: "Last year's activity.",
      archived: true,
      teacherId: reeves.id,
    },
  });

  const run = (template: { id: string; title: string; instructions: string | null; templatePathsJson: string | null; quizJson: string | null }, klass: { id: string }) =>
    db.assignment.create({
      data: {
        templateId: template.id,
        classId: klass.id,
        wholeClass: true,
        status: "LIVE",
        title: template.title,
        instructions: template.instructions,
        templateSnapshotJson: template.templatePathsJson,
        quizSnapshotJson: template.quizJson,
      },
    });

  await run(minibeast, robins);
  await run(ducksQuiz, ducklings);
  await run(method, herons);

  // Every persona teacher has a proved email address, for the reason given at
  // length in prisma/seed-test.ts: `emailConfirmedAt` gates buying, and a
  // business manager who cannot reach the purchase screen would file a blocker
  // about a gate that is working exactly as decided.
  await db.teacher.updateMany({
    where: { emailConfirmedAt: null },
    data: { emailConfirmedAt: new Date() },
  });

  console.log("\n[seed-personas] ✅ Bramblewood Primary ready — the tester team's environment.");
  console.log("  Admin (business manager): head@bramblewood.test / password");
  console.log("  Teacher (Ducklings/Robins/Herons/Wrens): reeves@bramblewood.test / password");
  console.log("  Teacher (Kestrels):       osei@bramblewood.test / password");
  console.log("  Teaching assistant:       ta@bramblewood.test / password");
  console.log("  Invited, never activated: chris.vale@bramblewood.test (removable)");
  console.log("  Class codes: DUCK01 (EYFS · Bo, Pip, Sky)  ROBN01 (KS1 · Nell…Wes)  HERN01 (KS2 · Wren…Zeb)");
  console.log("               KEST01 (Miss Osei's)  WREN01 (deletable, has a pupil and a moment)");
  console.log("  Parents: BRAM01 (Nell + Wren, two classes)  BRAM02 (Bo, removable)");
  console.log("  Live runs: Minibeast hunt → Robins · Count the ducks (QUIZ) → Ducklings · Explain your method → Herons");
  console.log("  Waiting in the queue: Nell (words), Otis (drawing).  Returned with a note: Wren.");

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
