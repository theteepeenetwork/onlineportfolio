import "dotenv/config";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Test fixtures for the QA battery (tenant isolation and friends).
//
// The security battery needs TWO schools so it can prove that a user in School
// B can never reach School A's pupils, journals or media. The shipping demo
// seed (prisma/seed.ts) has only one school (St Bede's), so this script:
//
//   1. Runs the normal demo seed first (FORCE_SEED) → gives us School A exactly
//      as the app ships it (teacher@school.uk, class SUN123, parent FAM123).
//   2. Appends a second, fully-isolated school ("Oakfield Primary") → School B.
//
// Everything here is FICTIONAL. This never runs against production data: it is
// only invoked by the battery's Playwright global-setup and the `db:seed:test`
// npm script, both of which target the local dev database.
// ---------------------------------------------------------------------------

const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), ".media");

const OAK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><rect x="150" y="120" width="100" height="140" fill="#8b5a2b"/><circle cx="200" cy="110" r="80" fill="#2e7d32"/></svg>`;

function writeSvg(name: string, svg: string) {
  writeFileSync(path.join(MEDIA_DIR, name), svg);
  return `/uploads/${name}`;
}

async function main() {
  // 1) Base demo seed = School A (St Bede's). Force it so we always start from
  //    the known clean state, exactly as the functional e2e suite expects.
  console.log("[seed-test] Seeding School A (demo) …");
  execSync("npm run db:seed", { stdio: "inherit", env: { ...process.env, FORCE_SEED: "1" } });

  const db = new PrismaClient();
  mkdirSync(MEDIA_DIR, { recursive: true });

  // 2) School B = Oakfield Primary. A completely separate tenant: its own admin,
  //    its own teacher, class, pupils, journal items and linked parent. Nothing
  //    here is linked to School A in any way.
  console.log("[seed-test] Appending School B (Oakfield) …");

  const DAY = 24 * 60 * 60 * 1000;

  const oak = await db.school.create({
    data: { name: "Oakfield Primary", seatLimit: 10 },
  });
  // Oakfield is on the free trial (full access) — mirrors School A.
  await db.subscription.create({
    data: { kind: "SCHOOL", status: "TRIAL", trialEndsAt: new Date(Date.now() + 42 * DAY), seatLimit: oak.seatLimit, schoolId: oak.id },
  });

  const oakAdmin = await db.teacher.create({
    data: {
      name: "Rosa Lindqvist",
      title: "Mrs",
      displayStyle: "formal",
      displayName: "Mrs Lindqvist",
      email: "admin@oakfield.sch.uk",
      passwordHash: await bcrypt.hash("password", 10),
      role: "ADMIN",
      status: "ACTIVE",
      schoolId: oak.id,
    },
  });

  const oakTeacher = await db.teacher.create({
    data: {
      name: "Tom Okafor",
      title: "Mr",
      displayStyle: "formal",
      displayName: "Mr Okafor",
      email: "teacher@oakfield.sch.uk",
      passwordHash: await bcrypt.hash("password", 10),
      role: "TEACHER",
      status: "ACTIVE",
      schoolId: oak.id,
    },
  });

  const acorn = await db.class.create({
    data: { name: "Acorn Class", yearGroup: "Year 1", classCode: "OAK111", teacherId: oakTeacher.id },
  });

  const oakColors = ["#2e7d32", "#1565c0", "#6a1b9a"];
  const [zara, yusuf, willow] = await Promise.all(
    ["Zara", "Yusuf", "Willow"].map((name, i) =>
      db.student.create({ data: { name, classId: acorn.id, avatarColor: oakColors[i % oakColors.length] } }),
    ),
  );

  // Two named media files so isolation specs can reference exact paths:
  //  - seed-oak.svg      → an APPROVED moment (a parent may see it; other tenants may not)
  //  - seed-oak-pending.svg → a PENDING moment (not even Oakfield's own parent may see it)
  const oakApproved = writeSvg("seed-oak.svg", OAK_SVG);
  const oakPending = writeSvg("seed-oak-pending.svg", OAK_SVG);

  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "My oak tree",
      mediaPath: oakApproved,
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: zara.id,
      classId: acorn.id,
    },
  });

  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "Waiting to be checked",
      mediaPath: oakPending,
      status: "PENDING",
      authorRole: "STUDENT",
      studentId: yusuf.id,
      classId: acorn.id,
    },
  });

  // A parent linked only to Zara (Oakfield). Signs in with family code OAKFAM1.
  await db.parent.create({
    data: {
      name: "Nadia Rahman",
      email: "parent@oakfield-family.com",
      familyCode: "OAKFAM1",
      children: { connect: [{ id: zara.id }] },
    },
  });

  // A quiz template + a run of it, so isolation specs can prove:
  //  - the quiz OPTION PICTURE (seed-oak-quiz.svg) is teacher-authored content:
  //    Oakfield's teacher and its assigned pupils may load it; no other tenant,
  //    and no parent, ever can.
  //  - a School B child's quiz ANSWER is PENDING child content scoped to School B.
  const oakQuizImg = writeSvg("seed-oak-quiz.svg", OAK_SVG);
  const oakQuiz = JSON.stringify({
    questions: [
      {
        id: "q0",
        pageIndex: 0,
        x: 300,
        y: 250,
        w: 400,
        h: 200,
        prompt: "Which picture shows the Oakfield oak leaf?", // distinctive marker for leak tests
        options: [
          { id: "opt0", text: "The oak leaf", imagePath: oakQuizImg },
          { id: "opt1", text: "Not this one" },
        ],
        correctOptionId: "opt0",
      },
    ],
  });
  const oakQuizTemplate = await db.activityTemplate.create({
    data: { title: "Oak leaf quiz", quizJson: oakQuiz, teacherId: oakTeacher.id },
  });
  const oakQuizRun = await db.assignment.create({
    data: {
      templateId: oakQuizTemplate.id,
      classId: acorn.id,
      wholeClass: true,
      status: "LIVE",
      title: oakQuizTemplate.title,
      quizSnapshotJson: oakQuiz,
    },
  });
  // Zara's quiz answer — a PENDING response carrying her selections + score.
  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "Zara's quiz answer",
      status: "PENDING",
      authorRole: "STUDENT",
      studentId: zara.id,
      classId: acorn.id,
      assignmentId: oakQuizRun.id,
      quizAnswersJson: JSON.stringify([{ questionId: "q0", selectedOptionId: "opt0" }]),
      quizScore: 1,
      quizTotal: 1,
    },
  });

  // Cross-device DRAFT fixtures (Stage 2), so isolation specs can prove a draft
  // page is owner-only:
  //  - a CHILD's response draft (Zara) — visible to Zara ONLY (not her teacher,
  //    not a parent, not another tenant).
  //  - a TEACHER's template draft (Okafor) — visible to Okafor only.
  const oakChildDraftImg = writeSvg("seed-oak-draft.svg", OAK_SVG);
  await db.draft.create({
    data: {
      surface: "ACTIVITY_RESPONSE",
      contextKey: oakQuizRun.id,
      ownerKey: `s:${zara.id}`,
      pagesJson: JSON.stringify([oakChildDraftImg]),
      expiresAt: new Date(Date.now() + 30 * DAY),
      studentId: zara.id,
      classId: acorn.id,
      assignmentId: oakQuizRun.id,
    },
  });
  const oakTeacherDraftImg = writeSvg("seed-oak-tmpl-draft.svg", OAK_SVG);
  await db.draft.create({
    data: {
      surface: "TEMPLATE_NEW",
      contextKey: "tmpl-new",
      ownerKey: `t:${oakTeacher.id}`,
      pagesJson: JSON.stringify([oakTeacherDraftImg]),
      expiresAt: new Date(Date.now() + 30 * DAY),
      teacherId: oakTeacher.id,
    },
  });

  // 3) School C = Larchwood Primary — a FROZEN (lapsed) account. Its trial ended
  //    with no subscription, so it is read-only: the battery uses it to prove
  //    that requireWritableAccount() blocks EVERY mutation server-side while
  //    viewing/downloading stay open (RETENTION.md frozen state). Its existing
  //    moment lets us assert the frozen teacher can still read/download work.
  console.log("[seed-test] Appending School C (Larchwood, FROZEN) …");
  const larch = await db.school.create({
    data: { name: "Larchwood Primary", seatLimit: 10 },
  });
  await db.subscription.create({
    data: {
      kind: "SCHOOL",
      status: "FROZEN",
      trialEndsAt: new Date(Date.now() - 10 * DAY), // trial lapsed 10 days ago
      frozenAt: new Date(Date.now() - 3 * DAY), // read-only for 3 days (12-month clock running)
      seatLimit: larch.seatLimit,
      schoolId: larch.id,
    },
  });
  const larchTeacher = await db.teacher.create({
    data: {
      name: "Ada Frost",
      title: "Ms",
      displayStyle: "formal",
      displayName: "Ms Frost",
      email: "teacher@larchwood.sch.uk",
      passwordHash: await bcrypt.hash("password", 10),
      role: "ADMIN", // admin so billing/account management stays reachable while frozen
      status: "ACTIVE",
      schoolId: larch.id,
    },
  });
  const larchClass = await db.class.create({
    data: { name: "Willow Class", yearGroup: "Year 2", classCode: "LRCH22", teacherId: larchTeacher.id },
  });
  const [pip] = await Promise.all(
    ["Pip", "Robin", "Sage"].map((name, i) =>
      db.student.create({ data: { name, classId: larchClass.id, avatarColor: oakColors[i % oakColors.length] } }),
    ),
  );
  const larchApproved = writeSvg("seed-larch.svg", OAK_SVG);
  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "Before the freeze",
      mediaPath: larchApproved,
      status: "APPROVED",
      approvedAt: new Date(Date.now() - 20 * DAY),
      authorRole: "STUDENT",
      studentId: pip.id,
      classId: larchClass.id,
    },
  });

  console.log("\n[seed-test] ✅ Two-tenant fixtures ready.");
  console.log("  School A (St Bede's):  admin  teacher@school.uk / password   class SUN123 (Sunflower)  parent FAM123");
  console.log("  School B (Oakfield):   admin  admin@oakfield.sch.uk / password");
  console.log("                         teacher teacher@oakfield.sch.uk / password  class OAK111 (Acorn)  parent OAKFAM1");
  console.log("  School B media: /uploads/seed-oak.svg (APPROVED)  /uploads/seed-oak-pending.svg (PENDING)  /uploads/seed-oak-quiz.svg (quiz option)");
  console.log("  School C (Larchwood, FROZEN): teacher@larchwood.sch.uk / password  class LRCH22 (Willow)  read-only");

  // Handy for a quick sanity check of the student-impersonation finding (F1).
  console.log(`  School B pupil ids: Zara=${zara.id} Yusuf=${yusuf.id} Willow=${willow.id}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
