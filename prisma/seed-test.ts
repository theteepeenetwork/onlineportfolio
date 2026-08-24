import "dotenv/config";
import { execSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { GIAS_IMPORT_JOB, formatImportDetail } from "@/lib/establishmentRegister";

// ---------------------------------------------------------------------------
// Test fixtures for the QA battery (tenant isolation and friends).
//
// The security battery needs TWO schools so it can prove that a user in School
// B can never reach School A's pupils, journals or media. The shipping demo
// seed (prisma/seed.ts) has only one school (St Bede's), so this script:
//
//   1. Runs the normal demo seed first (FORCE_SEED) → gives us School A exactly
//      as the app ships it (teacher@school.uk, class SUN234, parent FAM123).
//   2. Appends a second, fully-isolated school ("Oakfield Primary") → School B.
//
// Everything here is FICTIONAL. This never runs against production data: it is
// only invoked by the battery's Playwright global-setup and the `db:seed:test`
// npm script, both of which target the local dev database.
// ---------------------------------------------------------------------------

// The same production guard as prisma/seed.ts, for the same reason: this script
// runs the demo seed with FORCE_SEED=1 and then appends two more schools, so it
// wipes and rewrites everything exactly as that one does. It is only ever meant
// for the local battery database. Runs before anything is opened or written.
if (process.env.NODE_ENV === "production") {
  console.error("[seed-test] refusing to run: NODE_ENV is production.");
  console.error("[seed-test] These are test fixtures. They delete every row before writing.");
  process.exit(1);
}

const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), ".media");

// Connector API tokens, one per tenant. Mirrored in tests/battery/helpers.ts —
// keep the two in step. Fictional, and only ever loaded into the throwaway
// battery database; the column stores the SHA-256 of these, never the value.
const API_TOKEN_A = "sj_live_fixtureSchoolAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const API_TOKEN_B = "sj_live_fixtureSchoolBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const API_TOKEN_C = "sj_live_fixtureSchoolCfrozenCCCCCCCCCCCCCCCCCCC";

const OAK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><rect x="150" y="120" width="100" height="140" fill="#8b5a2b"/><circle cx="200" cy="110" r="80" fill="#2e7d32"/></svg>`;

function writeSvg(name: string, svg: string) {
  writeFileSync(path.join(MEDIA_DIR, name), svg);
  return `/uploads/${name}`;
}

// StoryJar's OWN library media lives in its own directory, separate from every
// teacher upload. See src/lib/mediaPath.ts for why that separation is the
// security control rather than tidiness.
const SHARED_MEDIA_DIR = process.env.SHARED_MEDIA_DIR || path.join(process.cwd(), ".media-shared");

function writeSharedSvg(name: string, svg: string) {
  writeFileSync(path.join(SHARED_MEDIA_DIR, name), svg);
  return `/uploads/shared/${name}`;
}

// Write raw bytes (used for the voice-note fixtures). The /uploads route serves
// whatever exists on disk and derives the content type from the extension, so
// placeholder bytes are enough for the access-control specs.
function writeBytesFile(name: string, bytes: Buffer) {
  writeFileSync(path.join(MEDIA_DIR, name), bytes);
  return `/uploads/${name}`;
}

async function main() {
  // 1) Base demo seed = School A (St Bede's). Force it so we always start from
  //    the known clean state, exactly as the functional e2e suite expects.
  console.log("[seed-test] Seeding School A (demo) …");
  execSync("npm run db:seed", { stdio: "inherit", env: { ...process.env, FORCE_SEED: "1" } });

  const db = new PrismaClient();
  mkdirSync(MEDIA_DIR, { recursive: true });
  mkdirSync(SHARED_MEDIA_DIR, { recursive: true });

  // 2) School B = Oakfield Primary. A completely separate tenant: its own admin,
  //    its own teacher, class, pupils, journal items and linked parent. Nothing
  //    here is linked to School A in any way.
  console.log("[seed-test] Appending School B (Oakfield) …");

  const DAY = 24 * 60 * 60 * 1000;

  const oak = await db.school.create({
    data: { name: "Oakfield Primary" },
  });
  // Oakfield is on the free trial (full access) — mirrors School A.
  await db.subscription.create({
    data: { kind: "SCHOOL", status: "TRIAL", trialEndsAt: new Date(Date.now() + 42 * DAY), schoolId: oak.id },
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
    data: { name: "Acorn Class", yearGroup: "Year 1", classCode: "ACRN22", teacherId: oakTeacher.id },
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

  // Voice-note (AUDIO) fixtures so the audio isolation spec can prove a voice
  // note is scoped exactly like a photo:
  //  - seed-oak-voice.m4a         → an APPROVED voice note (Zara) — her parent may play it; no other tenant may.
  //  - seed-oak-voice-pending.webm → a PENDING voice note (Yusuf) — not even Oakfield's own parent may reach it (rule 3).
  const oakVoiceApproved = writeBytesFile("seed-oak-voice.m4a", Buffer.from([0, 0, 0, 32]));
  const oakVoicePending = writeBytesFile("seed-oak-voice-pending.webm", Buffer.from([26, 69, 223, 163]));
  await db.journalItem.create({
    data: {
      type: "AUDIO",
      caption: "My news",
      mediaPath: oakVoiceApproved,
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: zara.id,
      classId: acorn.id,
    },
  });
  await db.journalItem.create({
    data: {
      type: "AUDIO",
      caption: "Waiting to be checked",
      mediaPath: oakVoicePending,
      status: "PENDING",
      authorRole: "STUDENT",
      studentId: yusuf.id,
      classId: acorn.id,
    },
  });

  // A parent linked only to Zara (Oakfield). Signs in with family code OAKFAM1.
  //
  // The address is on storyjar.co.uk for the same reason as the demo parent in
  // `seed.ts`: an address on somebody else's domain bounces the moment anything
  // actually sends to it. These fixtures never run in production, but whoever
  // first points a staging environment at a live Brevo key would inherit the
  // trap, and staging bounces damage the same sending reputation.
  await db.parent.create({
    data: {
      name: "Nadia Rahman",
      email: "demo-parent-oakfield@storyjar.co.uk",
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
  // A movable-object PICTURE (a photo the teacher dropped on the template as a
  // draggable piece). Like the quiz option picture, it is teacher-authored
  // content scoped by ownership/assignment — no other tenant, and no parent,
  // may load it. It lives in objectsJson / objectsSnapshotJson.
  const oakObjImg = writeSvg("seed-oak-object.svg", OAK_SVG);
  const oakObjects = JSON.stringify([
    [
      { id: "o0", type: "image", src: oakObjImg, x: 100, y: 100, w: 200, h: 150, aspect: 1.33, locked: false },
    ],
  ]);
  // The template BACKGROUND — the worksheet a child draws on top of. Teacher-
  // authored, scoped by ownership/assignment exactly like the quiz option and
  // object pictures above. It had no fixture at all until now, which is why the
  // two describes that say "scoped LIKE template media" were mirroring coverage
  // that did not exist (tenant-isolation.spec.ts).
  //
  // Deliberately its OWN file, never a child's response media: /uploads
  // authorises path-first, so a shared path means a child loading the template
  // gets checked against a stranger's work and refused.
  const oakTmplBg = writeSvg("seed-oak-tmpl-bg.svg", OAK_SVG);
  const oakTmplPaths = JSON.stringify([oakTmplBg]);
  const oakQuizTemplate = await db.activityTemplate.create({
    data: {
      title: "Oak leaf quiz",
      quizJson: oakQuiz,
      objectsJson: oakObjects,
      templatePathsJson: oakTmplPaths,
      teacherId: oakTeacher.id,
    },
  });
  const oakQuizRun = await db.assignment.create({
    data: {
      templateId: oakQuizTemplate.id,
      classId: acorn.id,
      wholeClass: true,
      status: "LIVE",
      title: oakQuizTemplate.title,
      quizSnapshotJson: oakQuiz,
      objectsSnapshotJson: oakObjects,
      templateSnapshotJson: oakTmplPaths,
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
    data: { name: "Larchwood Primary" },
  });
  await db.subscription.create({
    data: {
      kind: "SCHOOL",
      status: "FROZEN",
      trialEndsAt: new Date(Date.now() - 10 * DAY), // trial lapsed 10 days ago
      frozenAt: new Date(Date.now() - 3 * DAY), // read-only for 3 days (12-month clock running)
      // Fictional Stripe ids, and the only fixture that has any. Larchwood is
      // the school that once went through checkout and then lapsed, so the
      // operator billing screen (PR3) has a customer and a subscription to link
      // out to. St Bede's has neither, which makes it the negative control on
      // the same render: the screen must say Stripe holds nothing for it rather
      // than showing an empty space.
      //
      // These are never sent to Stripe. Nothing in the operator area calls
      // Stripe at all; the ids exist so a link can be built from them.
      // Deliberately unlike the ids in stripe-webhook.spec.ts, which rewrites
      // Oakfield's row, so the two fixtures cannot collide on the unique index.
      stripeCustomerId: "cus_seedlarchwood0001",
      stripeSubscriptionId: "sub_seedlarchwood0001",
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
    data: { name: "Willow Class", yearGroup: "Year 2", classCode: "ARCH22", teacherId: larchTeacher.id },
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

  // -------------------------------------------------------------------------
  // Mail delivery fixtures (PR5).
  //
  // Cleared first for the same reason the operator row is: the demo seed knows
  // nothing about these tables, so without this a second run would add to
  // whatever the last one left and the totals on the operator screen would
  // depend on how many times the battery had been run.
  //
  // The two windows are deliberately given DIFFERENT verdicts, because the
  // thing being proved is that a delivery state is a sentence rather than a
  // colour, and one sentence on a page proves nothing about the other one:
  //
  //   Today          12 accepted, nothing failed  -> "Every attempt was
  //                                                   accepted by Mailjet."
  //   Last 7 days    +4 accepted, 12 failed and 2 never attempted, so 14 of 30
  //                  -> well over one in five -> "Needs attention".
  //
  // The failing week is deliberately failing by a wide margin rather than by
  // one row. These counters are not inert fixtures: every magic-link request
  // any other spec makes is a real send attempt and lands in today's row, so a
  // ratio sitting just over the threshold would drift under it as soon as
  // another spec was added, and the mail specs would go red for a reason
  // nowhere near the mail code. At 14 of 30 it takes forty more successful
  // sends to tip, and a blocking test asserts the margin rather than trusting
  // this comment.
  //
  // The two UNCONFIGURED rows matter more than they look: that is the case
  // where the API key was missing or revoked, so no attempt reached Mailjet at
  // all, so there is no bounce and no provider-side error anywhere. This screen
  // is the only place it is visible.
  // -------------------------------------------------------------------------
  await db.mailCounter.deleteMany();
  await db.mailSuppression.deleteMany();
  await db.jobRun.deleteMany();

  const utcDayString = (back: number) =>
    new Date(Date.now() - back * DAY).toISOString().slice(0, 10);

  await db.mailCounter.createMany({
    data: [
      { day: utcDayString(0), templateKey: "magic-link", outcome: "SENT", statusClass: "", count: 12 },
      { day: utcDayString(2), templateKey: "magic-link", outcome: "SENT", statusClass: "", count: 4 },
      { day: utcDayString(2), templateKey: "magic-link", outcome: "FAILED", statusClass: "5xx", count: 8 },
      { day: utcDayString(3), templateKey: "magic-link", outcome: "FAILED", statusClass: "timeout", count: 4 },
      { day: utcDayString(4), templateKey: "magic-link", outcome: "UNCONFIGURED", statusClass: "", count: 2 },
      // Outside the seven-day window on purpose: it proves the window filters
      // rather than simply totalling the table.
      { day: utcDayString(20), templateKey: "magic-link", outcome: "FAILED", statusClass: "4xx", count: 99 },
    ],
  });

  // One suppressed address that belongs to a fixture parent, and one that
  // belongs to nobody. Both are needed: the first is what makes the delivery
  // line on an adult record mean something, and the second is what a real
  // suppression list looks like once an address has been removed from the
  // school's roll but not from the provider's blocklist.
  //
  // Hashed with the same MAIL_HMAC_KEY the dev server runs under, which
  // tests/battery/global-setup.ts passes in. If it is missing the seed refuses
  // rather than writing rows under a made-up key, because rows that hash to
  // nothing the application can match would make the specs fail somewhere far
  // away from the cause.
  const mailHmacKey = process.env.MAIL_HMAC_KEY;
  if (!mailHmacKey) {
    console.error("[seed-test] refusing to seed mail suppression: MAIL_HMAC_KEY is not set.");
    console.error("[seed-test] The battery sets it in tests/battery/global-setup.ts.");
    process.exit(1);
  }
  const label = (address: string) =>
    createHmac("sha256", mailHmacKey).update(address.trim().toLowerCase()).digest("hex");

  await db.mailSuppression.createMany({
    data: [
      {
        // Oakfield's parent is bouncing. St Bede's demo parent is deliberately
        // NOT here, so the two adult records read differently and neither
        // sentence can be the component's only output.
        addressHmac: label("demo-parent-oakfield@storyjar.co.uk"),
        state: "BOUNCE",
        firstSeenAt: new Date(Date.now() - 9 * DAY),
        lastSeenAt: new Date(Date.now() - 1 * DAY),
      },
      {
        addressHmac: label("someone-who-left@storyjar.test"),
        state: "UNSUBSCRIBED",
        firstSeenAt: new Date(Date.now() - 40 * DAY),
        lastSeenAt: new Date(Date.now() - 40 * DAY),
      },
    ],
  });

  await db.jobRun.create({
    data: {
      job: "mail:suppression-sync",
      startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000 + 4000),
      outcome: "SUCCESS",
      itemsAffected: 2,
      outcomeDetail: "30 day window",
    },
  });

  // -------------------------------------------------------------------------
  // Connector tokens (PR-connector).
  //
  // Three tokens, one per tenant, so cross-tenant isolation is testable on the
  // API surface the same way it already is on the screens: School A's token
  // must never reach School B's activities, and neither may write to School C,
  // which is frozen.
  //
  // The raw values are here in the clear, and they are fixtures in the same
  // sense as the operator password above: they exist only in prisma/seed-test.ts
  // and tests/battery/helpers.ts, they are only ever loaded into a throwaway
  // test database, and nothing in the application knows or cares that a token
  // is a fixture. Only the SHA-256 goes in the column, exactly as it does in
  // production — there is no fixture branch in resolveApiToken().
  //
  // Cleared first for the same reason the operator row is: the demo seed above
  // wipes school data and would leave these behind, and a second run would then
  // hit the unique constraint on the hash.
  // -------------------------------------------------------------------------
  await db.oAuthGrant.deleteMany();
  await db.oAuthClient.deleteMany();
  await db.apiToken.deleteMany();

  // A folder for School B, so the cross-tenant folder test has one to try to
  // borrow. Without it that test skips, and a skipped isolation test is a gap
  // wearing a green tick.
  await db.folder.create({ data: { name: "Oakfield — autumn", color: "#8AB9D6", teacherId: oakTeacher.id } });

  // School A's teacher comes from the demo seed this script runs first, so it is
  // looked up rather than created.
  const bedesTeacher = await db.teacher.findUnique({ where: { email: "teacher@school.uk" }, select: { id: true } });
  if (!bedesTeacher) throw new Error("[seed-test] expected teacher@school.uk from the demo seed");

  const sha = (value: string) => createHash("sha256").update(value).digest("hex");
  for (const [label, teacherId, token] of [
    ["Fixture — School A", bedesTeacher.id, API_TOKEN_A],
    ["Fixture — School B", oakTeacher.id, API_TOKEN_B],
    ["Fixture — School C (frozen)", larchTeacher.id, API_TOKEN_C],
  ] as const) {
    await db.apiToken.create({
      data: { teacherId, label, keyHash: sha(token), hint: token.slice(8, 12), kind: "PERSONAL" },
    });
  }

  // -------------------------------------------------------------------------
  // The platform operator fixture (PR1).
  //
  // This is how the blocking auth spec signs in WITHOUT a bypass: it knows the
  // password and the TOTP secret because they are written here, and it computes
  // a genuine six-digit code from that secret with the same library the
  // application uses. There is no SKIP_TOTP, no NODE_ENV === "test" branch and
  // no fixture flag anywhere in the sign-in path (handbook ruling R6), and the
  // only reason a test can get in is that it holds the same secret an
  // authenticator app would.
  //
  // The hashes are precomputed rather than hashed here on purpose: bcrypt at
  // cost 12 is ~200ms per hash by design, and eleven of them would add over two
  // seconds to every reseed, four times per battery run. They are bcrypt-12
  // hashes of the fictional values printed below, and the spec asserts the
  // stored password hash still carries the $2b$12$ prefix, so a drop in cost
  // factor is a red build rather than a quiet weakening.
  // -------------------------------------------------------------------------
  // Cleared first, because the demo seed above knows nothing about operators:
  // it wipes the school data and leaves this row behind, so a second run would
  // hit the unique address. Clearing it also resets the lockout counters, the
  // spent recovery codes and lastTotpStep, so every battery run starts from the
  // same known state rather than from whatever the last run's failures left.
  await db.operatorSession.deleteMany();
  await db.operator.deleteMany();

  await db.operator.create({
    data: {
      email: "ops@storyjar.test",
      // bcrypt-12 of "fixture-operator-pass-9271"
      pwHash: "$2b$12$ItZmvP10NMc5qT0KM3mb7OcMsIxqsHwnfOHNnUZ3Dz0aAwIG4R1IG",
      totpSecret: "GBX7MIWQ6ZXBKEIOGA2JYJPNCND2HCHN",
      // Already enrolled: the enrolment screen is exercised by the spec setting
      // this back to null for one test, so that both halves of the flow are
      // covered without a second operator row existing (owner decision D11:
      // one account).
      totpConfirmedAt: new Date(Date.now() - 7 * DAY),
      lastTotpStep: null,
      role: "OWNER",
      status: "ACTIVE",
      // bcrypt-12 of the ten codes listed in tests/battery/helpers.ts.
      recoveryCodesJson: JSON.stringify(
        [
          "$2b$12$zrt2IGaYCnEdnZS9fIHjK.YdFP4lUBcWMozlAIEmUMMKI5N6HsWcy",
          "$2b$12$zcU1RW2RHYnGfqCVROpLjurqjimyRegQXYum97cfHElbBt4ldDXty",
          "$2b$12$Yo/PArQ5Bu7kFIU6O3JqBeZnJKpbF3zfvrpFp0ceQdQs3BYj7G7KC",
          "$2b$12$UlTPTcbpyWQN5Bdl17ejWOD3CBBFEiGBK6FCNstuQz4YosPpcDLFq",
          "$2b$12$0nojwqtBr1PKFFX/fm8.2e6WhWWnVJP.opokfWZHcqJL3yzkANycK",
          "$2b$12$wRUvm.duFjGS2TnwusXMgeypLuhoX.ZzMQSeEU7h5CfAWQRyvh2oG",
          "$2b$12$KKiVNeb1HcN2JcnLjfn4tuSUmhFiuYa1i.Gi50/tI6uwFLR21JYO6",
          "$2b$12$TlOThFu57JMbHFwy26Wcl.X8ynb5/VTk//lG/iRRDVluux.yUUw..",
          "$2b$12$RCFJn/k.Trbsyiw97OMzi.9nMf8onTLhXmzR6EI0pgbhsi8x/iuzm",
          "$2b$12$iz95h9Io3ysomfebOffKXOp.JGbjmjhtKwDP0o0njUKilfwv20tmK",
        ].map((hash) => ({ hash, usedAt: null })),
      ),
    },
  });

  // -------------------------------------------------------------------------
  // StoryJar's shared activity library.
  //
  // Two rows, and the second one is the point: an UNPUBLISHED activity must be
  // invisible to every teacher, and its media unreadable, so the specs need one
  // that exists in order to prove it cannot be seen. A fixture that only ever
  // holds publishable content cannot prove the published flag does anything.
  //
  // These belong to nobody. No teacherId, no folderId, no school.
  // -------------------------------------------------------------------------
  // Cleared first, for the same reason as the operator row below: the demo seed
  // wipes the school data and knows nothing about the shared library, so a
  // second run would hit the unique slug. Clearing it also means a run never
  // inherits whatever an earlier run, or a hand-run of the publish script, left
  // in the table.
  //
  // Deleting these is SAFE for any teacher copy that exists, and that is worth
  // seeing in the fixtures rather than only in a test: the relation is SetNull,
  // and a copy carries its own files, so it survives its origin.
  await db.sharedActivity.deleteMany();

  const sharedBg = writeSharedSvg("seed-shared-bg.svg", OAK_SVG);
  const sharedQuizImg = writeSharedSvg("seed-shared-quiz.svg", OAK_SVG);
  const unpublishedBg = writeSharedSvg("seed-shared-unpublished-bg.svg", OAK_SVG);

  await db.sharedActivity.create({
    data: {
      slug: "seed-autumn-walk",
      title: "Our autumn walk",
      instructions: "Draw one thing you found outside today.",
      templatePathsJson: JSON.stringify([sharedBg]),
      quizJson: JSON.stringify({
        pages: [{ questions: [{ prompt: "Which one did you find?", options: [{ imagePath: sharedQuizImg }] }] }],
      }),
      tagsJson: JSON.stringify(["Autumn", "Outdoors"]),
      ageMode: "KS1",
      published: true,
      sortOrder: 10,
    },
  });

  await db.sharedActivity.create({
    data: {
      slug: "seed-not-published-yet",
      title: "Not published yet",
      instructions: "Nobody should ever see this.",
      templatePathsJson: JSON.stringify([unpublishedBg]),
      tagsJson: JSON.stringify(["Draft"]),
      ageMode: "KS2",
      published: false,
      sortOrder: 20,
    },
  });

  // -------------------------------------------------------------------------
  // The establishment register (PR-school-identity step 1).
  //
  // FICTIONAL SCHOOLS, and that is not negotiable: docs/TEST_LOGINS.md says
  // fictional data only, forever, and a real school's name in a fixture is a
  // real school's name in a screenshot — with a real school's postcode next to
  // it. Nothing here is imported from GIAS. The real register is loaded by hand
  // with `npm run gias:import`, and never in a test.
  //
  // Chosen so the search's decisions are testable rather than merely present:
  //   • two schools sharing "St Cuthbert's" and differing only by postcode,
  //     because that is what disambiguation has to survive;
  //   • one beginning with "The", so a word-prefix match can be proved;
  //   • one whose postcode has an outward code of a different length;
  //   • enough rows that a bound of 20 can be shown to bite (see the loop).
  // -------------------------------------------------------------------------
  await db.establishment.deleteMany();
  await db.establishment.createMany({
    data: [
      { urn: "900001", name: "Bramblewick Community Primary School", postcode: "AB1 2CD", localAuthority: "Barsetshire", phase: "Primary", town: "Ambledon" },
      { urn: "900002", name: "St Cuthbert's Catholic Primary School", postcode: "AB1 3EF", localAuthority: "Barsetshire", phase: "Primary", town: "Ambledon" },
      { urn: "900003", name: "St Cuthbert's Catholic Primary School", postcode: "CD12 9ZZ", localAuthority: "Wessex", phase: "Primary", town: "Fernhollow" },
      { urn: "900004", name: "The Grange Infant School", postcode: "AB2 4GH", localAuthority: "Barsetshire", phase: "Primary", town: "Marlow End" },
      { urn: "900005", name: "Little Wren Nursery School", postcode: "AB2 5JK", localAuthority: "Barsetshire", phase: "Nursery", town: "Wren Hill" },
      { urn: "900006", name: "Halcyon House Special School", postcode: "AB1 7NP", localAuthority: "Barsetshire", phase: "Not applicable", town: "Ambledon" },
      { urn: "900007", name: "Thornbury Green Junior School", postcode: "", localAuthority: "Barsetshire", phase: "Primary", town: "Thornbury" },
      // Twenty-five more sharing one prefix, so a spec can prove the result set
      // is bounded at 20 and that the caller is told there are more.
      ...Array.from({ length: 25 }, (_, i) => ({
        urn: `9001${String(i).padStart(2, "0")}`,
        name: `Meadowbank Primary School ${i + 1}`,
        postcode: `ZZ9 ${i}AA`,
        localAuthority: "Barsetshire",
        phase: "Primary",
        town: "Meadowbank",
      })),
    ],
  });

  // The refresh that put them there. Seeded alongside the rows because the
  // health tile reports on the IMPORT and not on the row count: rows with no
  // recorded refresh is the "never imported" state, which is a different fact
  // and must not render as a healthy register.
  await db.jobRun.deleteMany({ where: { job: GIAS_IMPORT_JOB } });
  await db.jobRun.create({
    data: {
      job: GIAS_IMPORT_JOB,
      startedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      finishedAt: new Date(Date.now() - 26 * 60 * 60 * 1000 + 9_000),
      outcome: "SUCCESS",
      itemsAffected: 32,
      // Through the formatter, not as a literal: the spelling is held to a
      // log-hygiene invariant by tests/battery/security/ops-mail.spec.ts, and a
      // hand-typed fixture is how a seed comes to disagree with the code.
      outcomeDetail: formatImportDetail("2026-08-24"),
    },
  });

  console.log("\n[seed-test] ✅ Two-tenant fixtures ready.");
  console.log("  School A (St Bede's):  admin  teacher@school.uk / password   class SUN234 (Sunflower)  parent FAM123");
  console.log("  School B (Oakfield):   admin  admin@oakfield.sch.uk / password");
  console.log("                         teacher teacher@oakfield.sch.uk / password  class ACRN22 (Acorn)  parent OAKFAM1");
  console.log("  School B media: /uploads/seed-oak.svg (APPROVED)  /uploads/seed-oak-pending.svg (PENDING)  /uploads/seed-oak-quiz.svg (quiz option)");
  console.log("  School B voice: /uploads/seed-oak-voice.m4a (APPROVED)  /uploads/seed-oak-voice-pending.webm (PENDING)");
  console.log("  School C (Larchwood, FROZEN): teacher@larchwood.sch.uk / password  class ARCH22 (Willow)  read-only");
  console.log("  StoryJar library: seed-autumn-walk (published, /uploads/shared/seed-shared-bg.svg)  seed-not-published-yet (unpublished)");
  console.log("  Connector tokens: School A/B/C — see API_TOKEN_* in prisma/seed-test.ts and tests/battery/helpers.ts");
  console.log("  Establishment register: 32 fictional schools (Bramblewick, St Cuthbert's ×2, The Grange, 25× Meadowbank for the bound)");
  console.log("  Platform operator: ops@storyjar.test / fixture-operator-pass-9271 + a real TOTP code (no bypass exists)");

  // Handy for a quick sanity check of the student-impersonation finding (F1).
  console.log(`  School B pupil ids: Zara=${zara.id} Yusuf=${yusuf.id} Willow=${willow.id}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
