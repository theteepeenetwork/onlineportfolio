import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { loginTeacher } from "../helpers";

// ===========================================================================
// The September job: moving each class up a year and handing it to its new
// teacher (docs/paid-tier-plan.md item 1).
//
// THE PROPERTIES, in the order they matter:
//
//   1. NO WORK IS LOST. Counted either side, the way class-handover.spec.ts
//      counts for F68, because "nothing is deleted" is a fact to prove and not
//      an intention to state.
//   2. LAST YEAR'S WORK STAYS LABELLED WITH LAST YEAR'S CLASS. `JournalItem`
//      keeps its own `classId`; only `Student.classId` moves. This is the whole
//      reason the rollover makes a NEW class rather than renaming the old one,
//      and it is the assertion that would fail if somebody "simplified" it back.
//   3. THE NEW TEACHER CAN REACH THE CHILD AND THEIR OLDER WORK — including its
//      MEDIA, which is the divergence the access-path audit found: the pupil
//      page reaches moments through the child, `/uploads` used to reach them
//      through the moment's own class, and those stop being the same set the
//      first time a child moves.
//   4. THE OUTGOING TEACHER LOSES THEM.
//   5. The class code is new (F66), and the family code is not.
//   6. A class with work still in the queue cannot move at all.
//   7. Cross-tenant: School B's admin cannot move School A's class.
//
// Driven through the real console, not by calling the action: a spec that
// simulated the click would keep passing against a rollover that changed
// underneath it (class-handover.spec.ts's own lesson).
//
// EVERY SELECTOR BELOW USES `.` WHERE THE SCREEN HAS AN APOSTROPHE. The panes
// render `&rsquo;`, a curly one, and a straight `'` in a regex matches nothing —
// silently, as a two-minute timeout rather than as "no such element". FINDINGS
// F52 is the same hazard one layer down, in a gate that could not read past an
// apostrophe either.
// ===========================================================================

const db = new PrismaClient();

// Where the media route actually looks. A `JournalItem` row pointing at a file
// that does not exist is served as 404 — the same answer as "you may not have
// this", because the route deliberately does not distinguish the two (rule 8,
// deny by default and leak nothing). So a spec asserting AUTHORISATION has to
// put a real file there, or it is asserting that a missing file is missing.
const MEDIA_DIR = path.join(process.cwd(), ".media");

/**
 * Sign in, and WAIT FOR THE REDIRECT TO LAND before anybody navigates.
 *
 * `loginTeacher` returns the moment the URL matches, which can be mid-flight. A
 * `page.goto` issued into that aborts the navigation already running —
 * `net::ERR_ABORTED; maybe frame was detached?`, which reads like a broken test
 * and is a broken navigation. Every sign-in in this file goes through here, and
 * every one that did not cost a two-minute timeout to find out.
 */
async function signIn(page: import("@playwright/test").Page, email: string) {
  await loginTeacher(page, { email, password: "password" });
  await page.waitForLoadState("networkidle");
}


/**
 * Land an admin on the Move-up tab.
 *
 * An admin is NOT sent to /admin by signing in — they land on /teacher and reach
 * the console through "School admin →". I removed this `goto` once on the
 * assumption that they were, and the failure snapshot showed the teacher shell,
 * which is how I found out. The abort that prompted it was the sign-in redirect
 * still in flight; `signIn` settles that, so the navigation is safe here.
 */
async function onMoveUp(page: import("@playwright/test").Page) {
  // An admin lands on /teacher and reaches the console through "School admin →",
  // so /admin is a real navigation rather than somewhere sign-in leaves them.
  // `signIn` has already settled the redirect that would otherwise abort it.
  await page.goto("/admin");
  // And settle again before pressing anything: a control pressed before
  // hydration is a plain POST whose returned state is never painted (F36).
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Move up" }).click();
}


type World = {
  schoolId: string;
  classId: string;
  className: string;
  classCode: string;
  outgoingId: string;
  incomingId: string;
  adminEmail: string;
  pupilId: string;
  momentId: string;
  parentId: string;
  familyCode: string;
};

/** Write a real file into the media directory and return the path the row stores. */
function mediaFile(name: string): string {
  mkdirSync(MEDIA_DIR, { recursive: true });
  writeFileSync(path.join(MEDIA_DIR, name), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
  return `/uploads/${name}`;
}

async function makeSchool(tag: string): Promise<World> {
  const stamp = `${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const school = await db.school.create({ data: { name: `Rollover ${stamp}`, verifiedAt: new Date() } });
  await db.subscription.create({ data: { kind: "SCHOOL", status: "ACTIVE", schoolId: school.id } });
  const mkTeacher = (role: string, label: string) =>
    db.teacher.create({
      data: {
        name: `${label} ${stamp}`,
        displayName: label,
        email: `${label.toLowerCase()}-${stamp}@rollover.test`,
        passwordHash: bcrypt.hashSync("password", 10),
        role,
        status: "ACTIVE",
        schoolId: school.id,
        emailConfirmedAt: new Date(),
      },
    });
  const admin = await mkTeacher("ADMIN", "Admin");
  const outgoing = await mkTeacher("TEACHER", "Outgoing");
  const incoming = await mkTeacher("TEACHER", "Incoming");

  const classCode = `RO${stamp.slice(-4).toUpperCase()}`;
  const klass = await db.class.create({
    data: { name: `Robins ${stamp}`, yearGroup: "Year 2", ageMode: "KS1", classCode, teacherId: outgoing.id, schoolId: school.id },
  });
  const pupil = await db.student.create({ data: { name: "Amara", classId: klass.id, avatarColor: "#E08A9B" } });
  const moment = await db.journalItem.create({
    data: {
      type: "DRAWING",
      // A media path, so the `/uploads` authorisation can be exercised: the
      // whole point of the audit's fix is that this file must still reach the
      // NEW teacher after the child has moved.
      mediaPath: mediaFile(`rollover-${stamp}.svg`),
      status: "APPROVED",
      studentId: pupil.id,
      classId: klass.id,
      authorRole: "STUDENT",
    },
  });
  const familyCode = `FAM${stamp.slice(-5).toUpperCase()}`;
  const parent = await db.parent.create({ data: { familyCode, children: { connect: { id: pupil.id } } } });

  return {
    schoolId: school.id, classId: klass.id, className: klass.name, classCode,
    outgoingId: outgoing.id, incomingId: incoming.id, adminEmail: admin.email,
    pupilId: pupil.id, momentId: moment.id, parentId: parent.id, familyCode,
  };
}

async function teardown(w: World) {
  const item = await db.journalItem.findUnique({ where: { id: w.momentId }, select: { mediaPath: true } });
  if (item?.mediaPath) rmSync(path.join(MEDIA_DIR, path.basename(item.mediaPath)), { force: true });
  await db.journalItem.deleteMany({ where: { studentId: w.pupilId } });
  await db.parent.deleteMany({ where: { id: w.parentId } });
  await db.student.deleteMany({ where: { id: w.pupilId } });
  await db.class.deleteMany({ where: { schoolId: w.schoolId } });
  await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
  await db.teacher.deleteMany({ where: { schoolId: w.schoolId } });
  await db.subscription.deleteMany({ where: { schoolId: w.schoolId } });
  await db.school.deleteMany({ where: { id: w.schoolId } });
}

async function counts(w: World) {
  return {
    classes: await db.class.count({ where: { schoolId: w.schoolId } }),
    pupils: await db.student.count({ where: { class: { schoolId: w.schoolId } } }),
    moments: await db.journalItem.count({ where: { studentId: w.pupilId } }),
  };
}

test("a class moves up: the children go, their work stays labelled, and nothing is lost", async ({ page }) => {
  const w = await makeSchool("move");
  try {
    const before = await counts(w);

    await signIn(page, w.adminEmail);
    await onMoveUp(page);

    // The costs are stated BEFORE the press, not discovered after it.
    await expect(page.getByText(/Every class gets a new class code/i)).toBeVisible();
    await expect(page.getByText(/Family codes do not change/i)).toBeVisible();

    await page.getByLabel(/Next year.s name/i).fill("Wrens Y3");
    // The year group is suggested, not imposed: "Year 2" → "Year 3".
    await expect(page.getByLabel(/^Year group$/i)).toHaveValue("Year 3");
    await page.getByLabel(/Next year.s teacher/i).selectOption(w.incomingId);
    await page.getByRole("button", { name: /^Move 1 up$/ }).click();
    await expect(page.getByText(/Wrens Y3/).first()).toBeVisible({ timeout: 15_000 });

    // 1. NOTHING IS LOST. One class became two (the new one plus the archived
    //    old one); the child and the moment are exactly where they were.
    const after = await counts(w);
    expect(after.classes).toBe(before.classes + 1);
    expect(after.pupils).toBe(before.pupils);
    expect(after.moments).toBe(before.moments);

    const oldClass = await db.class.findUniqueOrThrow({ where: { id: w.classId } });
    expect(oldClass.archivedAt, "last year's class is archived, never deleted").not.toBeNull();

    const next = await db.class.findFirstOrThrow({ where: { schoolId: w.schoolId, name: "Wrens Y3" } });
    expect(next.teacherId).toBe(w.incomingId);
    expect(next.yearGroup).toBe("Year 3");
    expect(next.schoolId).toBe(w.schoolId);
    // Never `broughtInByTeacherId`: next year's class is the school's from the
    // moment it exists, so a lapsed plan cannot hand it to one adult.
    expect(next.broughtInByTeacherId).toBeNull();
    // 2. THE REGISTER IS CARRIED ACROSS, NEVER BUMPED. Year 2 → Year 3 does not
    //    make a class KS2 by arithmetic (SAFEGUARDING rule 8, and the schema
    //    comment on `ageMode` forbids inferring it from a year group).
    expect(next.ageMode).toBe("KS1");

    // 3. THE CHILD MOVED; THE WORK DID NOT.
    const pupil = await db.student.findUniqueOrThrow({ where: { id: w.pupilId } });
    expect(pupil.classId).toBe(next.id);
    const moment = await db.journalItem.findUniqueOrThrow({ where: { id: w.momentId } });
    expect(moment.classId, "last year's work stays labelled with last year's class").toBe(w.classId);

    // 4. THE CODE IS NEW, AND THE FAMILY CODE IS NOT.
    expect(next.classCode).not.toBe(w.classCode);
    expect((await db.parent.findUniqueOrThrow({ where: { id: w.parentId } })).familyCode).toBe(w.familyCode);

    // 5. A DISTINCT AUDIT ACTION. `CLASS_ASSIGNED` would make the admin
    //    console's "you are holding a colleague's class" flag say something
    //    untrue, because it substring-matches those rows.
    const rows = await db.auditLog.findMany({ where: { schoolId: w.schoolId } });
    expect(rows.some((r) => r.action === "CLASS_MOVED_UP")).toBe(true);
    expect(rows.some((r) => r.action === "CLASS_ASSIGNED")).toBe(false);
  } finally {
    await teardown(w);
  }
});

test("after the move the new teacher reaches the child and last year's media, and the old teacher does not", async ({ page, browser }) => {
  const w = await makeSchool("access");
  try {
    await signIn(page, w.adminEmail);
    await onMoveUp(page);
    await page.getByLabel(/Next year.s teacher/i).selectOption(w.incomingId);
    await page.getByRole("button", { name: /^Move 1 up$/ }).click();
    // Read from "What you have moved", which the SERVER builds from the audit
    // log. A success cannot be shown inside the row that produced it: archiving
    // removes that row in the same commit that delivers the result. CI found
    // that by waiting fifteen seconds for a message the screen could not show,
    // and a first fix that kept the outcome in React state failed the same way,
    // because the row unmounts before its effect can hand anything upwards.
    await expect(page.getByText(/a new class code was issued/i)).toBeVisible({ timeout: 15_000 });

    const media = (await db.journalItem.findUniqueOrThrow({ where: { id: w.momentId } })).mediaPath!;
    const incoming = await db.teacher.findUniqueOrThrow({ where: { id: w.incomingId } });
    const outgoing = await db.teacher.findUniqueOrThrow({ where: { id: w.outgoingId } });

    // THE INCOMING TEACHER. The pupil page is reached through the child's
    // CURRENT class, so it works — and the media route now resolves the same
    // way, which is the fix the access-path audit landed ahead of this change.
    // A 404 here is the "item renders, picture is a broken box" failure.
    const inCtx = await browser.newContext();
    const inPage = await inCtx.newPage();
    await signIn(inPage, incoming.email);
    await inPage.goto(`/teacher/students/${w.pupilId}`);
    await expect(inPage.getByRole("heading", { name: /Amara/ })).toBeVisible();
    // A REAL FILE IS ON DISK FOR THIS ONE (see `mediaFile`), so a 404 here can
    // only mean the route refused — which is the thing being tested. Without it
    // the assertion would pass or fail on whether a file existed, and the route
    // answers 404 to both questions on purpose.
    const okay = await inPage.request.get(media);
    expect(okay.status(), "the new teacher must be able to load last year's drawing").toBe(200);
    await inCtx.close();

    // THE OUTGOING TEACHER no longer teaches this child, and loses both.
    const outCtx = await browser.newContext();
    const outPage = await outCtx.newPage();
    await signIn(outPage, outgoing.email);
    const gone = await outPage.goto(`/teacher/students/${w.pupilId}`);
    expect(gone?.status()).toBe(404);
    const denied = await outPage.request.get(media);
    expect(denied.status()).toBe(404);
    await outCtx.close();
  } finally {
    await teardown(w);
  }
});

test("a class with work still in the queue cannot move, and says who to ask", async ({ page }) => {
  const w = await makeSchool("queue");
  try {
    await db.journalItem.create({
      data: { type: "TEXT", textContent: "not yet approved", status: "PENDING", studentId: w.pupilId, classId: w.classId, authorRole: "STUDENT" },
    });

    await signIn(page, w.adminEmail);
    await onMoveUp(page);

    // Said as a fact, with the person who can fix it named — not a disabled
    // control with no explanation.
    await expect(page.getByText(/still waiting to be approved/i).first()).toBeVisible();
    await expect(page.getByText(/Outgoing/).first()).toBeVisible();
    // And there is no control to press.
    await expect(page.getByRole("button", { name: /^Move \d+ up$/ })).toHaveCount(0);

    // The class did not move.
    expect((await db.class.findUniqueOrThrow({ where: { id: w.classId } })).archivedAt).toBeNull();
    expect((await db.student.findUniqueOrThrow({ where: { id: w.pupilId } })).classId).toBe(w.classId);
  } finally {
    await teardown(w);
  }
});

test("leavers are archived, and every child's work survives it", async ({ page }) => {
  const w = await makeSchool("leavers");
  try {
    const before = await counts(w);
    await signIn(page, w.adminEmail);
    await onMoveUp(page);
    await page.getByRole("button", { name: /They.re leaving/i }).click();
    await page.getByLabel(/Type .* to confirm/i).fill(w.className);
    await page.getByRole("button", { name: /Archive as leavers/i }).click();
    // From the same server-read record, for the reason given in the move test.
    await expect(page.getByText(/Nothing was deleted/i).first()).toBeVisible({ timeout: 15_000 });

    const after = await counts(w);
    expect(after.pupils, "archiving is not deletion").toBe(before.pupils);
    expect(after.moments).toBe(before.moments);
    expect((await db.class.findUniqueOrThrow({ where: { id: w.classId } })).archivedAt).not.toBeNull();
    // The child is still in it — leavers do not move anywhere.
    expect((await db.student.findUniqueOrThrow({ where: { id: w.pupilId } })).classId).toBe(w.classId);
  } finally {
    await teardown(w);
  }
});

test("an archived class is gone from every this-year surface, and its work is still reachable through the child", async ({ page }) => {
  const w = await makeSchool("hidden");
  try {
    await db.class.update({ where: { id: w.classId }, data: { archivedAt: new Date() } });
    const outgoing = await db.teacher.findUniqueOrThrow({ where: { id: w.outgoingId } });
    await signIn(page, outgoing.email);

    // The rail, the class manager and the calendar's chips.
    await expect(page.getByRole("navigation").first().getByText(w.className)).toHaveCount(0);
    await page.goto("/teacher/class");
    await expect(page.getByText(w.className)).toHaveCount(0);
    await page.goto("/teacher/calendar");
    await expect(page.getByText(w.className)).toHaveCount(0);

    // But the child is still theirs and so is the work: archiving is not
    // deletion, and the pupil page reaches moments through the CHILD.
    await page.goto(`/teacher/students/${w.pupilId}`);
    await expect(page.getByRole("heading", { name: /Amara/ })).toBeVisible();
  } finally {
    await teardown(w);
  }
});

test("cross-tenant: an admin cannot move another school's class", async ({ page }) => {
  const mine = await makeSchool("mine");
  const theirs = await makeSchool("theirs");
  try {
    await signIn(page, mine.adminEmail);
    // Forged from the page the server rendered, which is how a tampered form
    // actually arrives — never a hand-built POST (agent-memory: forge by
    // tampering with a form the server rendered).
    await onMoveUp(page);
    await page.evaluate((id) => {
      const input = document.querySelector('input[name="classId"]') as HTMLInputElement | null;
      if (input) input.value = id;
    }, theirs.classId);
    await page.getByLabel(/Next year.s name/i).fill("Stolen");
    await page.getByRole("button", { name: /^Move \d+ up$/ }).click();

    await expect(page.getByText(/isn't one of yours/i)).toBeVisible({ timeout: 15_000 });
    // Nothing happened to the other school.
    expect((await db.class.findUniqueOrThrow({ where: { id: theirs.classId } })).archivedAt).toBeNull();
    expect((await db.student.findUniqueOrThrow({ where: { id: theirs.pupilId } })).classId).toBe(theirs.classId);
    expect(await db.class.count({ where: { schoolId: theirs.schoolId } })).toBe(1);
  } finally {
    await teardown(mine);
    await teardown(theirs);
  }
});
