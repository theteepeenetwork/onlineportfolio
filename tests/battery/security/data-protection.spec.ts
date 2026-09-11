import { test, expect } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { SCHOOL_A, SCHOOL_B, loginTeacher, loginParent, studentIdFromLogin } from "../helpers";

const db = new PrismaClient();

// ===========================================================================
// A11 — Data protection (DPIA evidence)
//
// The passing, gating checks: no third-party trackers, no child PII in URLs,
// and that pupil removal really deletes the rows. (The media-file erasure gap
// on per-item/per-pupil delete is logged as finding F3 and lives in
// tests/battery/findings/ — deletion of a *whole class* does erase, but the
// narrower delete paths do not.)
// ===========================================================================

// Any request whose host isn't our own origin is a third party. StoryJar
// promises "no trackers" (SAFEGUARDING.md rule 11) — assert nothing phones home.
async function assertNoThirdPartyRequests(page: import("@playwright/test").Page, gotoUrl: string) {
  const offOrigin: string[] = [];
  const origin = new URL(page.url() || "http://localhost").origin;
  const handler = (req: import("@playwright/test").Request) => {
    const u = new URL(req.url());
    if (u.origin !== origin && u.protocol !== "data:" && u.protocol !== "blob:") {
      offOrigin.push(req.url());
    }
  };
  page.on("request", handler);
  await page.goto(gotoUrl, { waitUntil: "networkidle" });
  page.off("request", handler);
  expect(offOrigin, `unexpected third-party requests: ${offOrigin.join(", ")}`).toHaveLength(0);
}

test("no third-party/tracker requests on the family view", async ({ page }) => {
  await loginParent(page, SCHOOL_A.parentFamilyCode);
  await assertNoThirdPartyRequests(page, "/family");
});

test("no third-party/tracker requests on the teacher dashboard + journal", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  await assertNoThirdPartyRequests(page, "/teacher");
  await assertNoThirdPartyRequests(page, "/teacher/queue");
});

test("child names never appear in URLs while browsing", async ({ page }) => {
  await loginTeacher(page, SCHOOL_A.admin);
  const seen: string[] = [];
  page.on("framenavigated", (f) => seen.push(f.url()));

  await page.goto("/teacher");
  await page.goto("/teacher/class");
  await page.goto("/teacher/queue");

  // Pupil identifiers in paths are opaque cuids; a child's *name* must never be
  // in a URL (query or path).
  for (const url of seen) {
    expect(url, `child name leaked in URL: ${url}`).not.toMatch(/Amara|Ben|Chloe|Zara|Yusuf|Willow/);
  }
});

test("removing a pupil deletes the row (cascade works)", async ({ page }) => {
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();

  // Add a throwaway pupil, confirm present.
  await page.getByRole("button", { name: /add pupil/i }).click();
  await page.locator('textarea[name="names"]').fill("Tempdeletee");
  await page.getByRole("button", { name: /add pupil/i }).last().click();
  // Wait for the ADD to land, not merely for the name to be somewhere on the
  // page: the box a teacher typed into still holds the name until the server
  // action comes back, so "the name is visible" can be true while the register
  // below is still the old one. The form clears itself on success, so an empty
  // box is the signal that the roster on screen is the roster in the database —
  // and the row locators below depend on that being true.
  await expect(page.locator('textarea[name="names"]')).toHaveValue("");
  await expect(page.getByText("Tempdeletee")).toBeVisible();

  // Enter settings mode and remove them. Target the roster row that both shows
  // the name and carries a Remove button (settings mode reveals per-child forms).
  await page.getByRole("button", { name: /class settings/i }).click();
  const removeBtn = page
    .getByRole("main")
    .locator("div")
    .filter({ hasText: "Tempdeletee" })
    .filter({ has: page.getByRole("button", { name: /^remove$/i }) })
    .last()
    .getByRole("button", { name: /^remove$/i });
  await removeBtn.click();

  await expect(page.getByText("Tempdeletee")).toHaveCount(0);
});

test("a teacher can export their own class; another tenant cannot (F4)", async ({ page }) => {
  // School B teacher opens Acorn settings and finds the export link.
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto("/teacher/class");
  await page.getByRole("button", { name: /acorn/i }).click();
  await page.getByRole("button", { name: /class settings/i }).click();
  const href = await page.getByRole("link", { name: /export class data/i }).getAttribute("href");
  expect(href).toMatch(/^\/teacher\/export\//);

  // Own class → 200 with the pupils' data.
  const mine = await page.request.get(href!);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-disposition"]).toContain("attachment");
  const body = await mine.json();
  expect(body.schema).toBe("storyjar-class-export-v1");
  expect(JSON.stringify(body)).toContain("Zara");

  // Cross-tenant: School A admin must NOT be able to export School B's class.
  await loginTeacher(page, SCHOOL_A.admin);
  const theirs = await page.request.get(href!);
  expect(theirs.status()).toBe(404);
});

test("the per-pupil export answers for one child, and only to that child's teacher", async ({ page }) => {
  // The subject-access export: "what do you hold about my child". Scoped the
  // same way the class export and the pupil's own journal page are — the
  // teacher whose class the child is in, nobody else.
  const zaraId = await studentIdFromLogin(page, SCHOOL_B.classCode, "Zara");
  const url = `/teacher/export/pupil/${zaraId}`;

  // The teacher who owns Acorn → 200, and it is about Zara.
  await loginTeacher(page, SCHOOL_B.teacher);
  const mine = await page.request.get(url);
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-disposition"]).toContain("attachment");
  expect(mine.headers()["cache-control"]).toContain("no-store");
  const body = await mine.json();
  expect(body.schema).toBe("storyjar-pupil-export-v1");
  expect(body.pupil.firstName).toBe("Zara");

  // One child's file holds one child. Yusuf is in the same class and must not
  // be in it.
  const raw = JSON.stringify(body);
  expect(raw, "another pupil's name leaked into a per-pupil export").not.toContain("Yusuf");

  // Nothing in this file may be a credential or a profile: a parent is handed
  // it. The class code signs somebody in as any pupil in the class, the family
  // code signs them in as a household, and jarSeenAt is profiling (rule 11).
  expect(raw, "a class code must never leave in a pupil export").not.toContain(SCHOOL_B.classCode);
  expect(raw, "a family code must never leave in a pupil export").not.toContain(SCHOOL_B.parentFamilyCode);
  expect(raw, "when a child last opened their jar must never be exported").not.toContain("jarSeenAt");

  // Family access is a COUNT and nothing else. A per-household date or flag is
  // a written claim about the OTHER household, in a file handed to this one —
  // and `takenUp` was wrong in both directions besides, because parent sessions
  // are purged 7 days after they expire.
  expect(body.familyAccess.places, "how many households can see this jar").toBeGreaterThanOrEqual(0);
  expect(body.familyAccess.households, "no per-household detail may be exported").toBeUndefined();
  expect(raw, "a session-derived 'taken up' claim about a household").not.toContain("takenUp");

  // Rule 3's human gate: the file carries work nobody has approved, so it has
  // to say so where the person handing it over will see it.
  expect(body.reviewBeforeSharing.momentsNotApproved).toBeGreaterThan(0); // Zara's quiz answer is PENDING
  expect(body.reviewBeforeSharing.note).toMatch(/not been through the approval queue/i);

  // A subject access answer has to be intelligible. Stored answers are opaque
  // ids ("opt2"), so they are resolved against the frozen quiz into the words
  // the child was actually shown.
  const quizMoment = body.moments.find((m: { quizAnswers?: unknown[] }) => m.quizAnswers?.length);
  expect(quizMoment, "Zara's seeded quiz response").toBeTruthy();
  expect(quizMoment.quizAnswers[0].question, "the question, not its id").toContain("oak leaf");
  expect(JSON.stringify(quizMoment.quizAnswers)).not.toMatch(/"opt\d/);

  // Another teacher in the SAME school, who does not teach Acorn, gets nothing.
  // A subject access request is a reason to read out what is held, not a reason
  // to widen who may read it.
  await loginTeacher(page, SCHOOL_B.admin);
  const colleague = await page.request.get(url);
  expect(colleague.status(), "a school colleague who does not teach this child").toBe(404);

  // Cross-tenant: School A must not reach School B's child.
  await loginTeacher(page, SCHOOL_A.admin);
  const theirs = await page.request.get(url);
  expect(theirs.status(), "School A reached School B's pupil").toBe(404);
});

test("a pupil's export carries their own \"not needed\" marks, and no other child's [cross-tenant]", async ({ page }) => {
  // Data protection lead, 10 September 2026: a "not needed" mark is data about
  // the child, so it is in their subject-access file — the run's title and the
  // date, and nothing else, because there is nothing else (no reason column,
  // by design). The marks are written directly rather than through the button:
  // pressing it is run-excusal.spec.ts's subject, and THIS test is about what
  // the file discloses once a mark is held.
  //
  // Its own two classes in two schools, so the shared fixtures are untouched.
  // The titles are distinctive so "absent" is a real search: a run title that
  // appeared anywhere else in a file would make not.toContain() meaningless.
  const B_TITLE = "Leaf rubbing on the field (Rowans)";
  const A_TITLE = "Counting conkers (Hollies)";
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const code = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

  const bTeacher = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.teacher.email } });
  const aTeacher = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_A.otherTeacher.email } });
  const bClass = await db.class.create({
    data: { name: "Export Rowans", ageMode: "KS1", classCode: code(), teacherId: bTeacher.id, schoolId: bTeacher.schoolId },
  });
  const aClass = await db.class.create({
    data: { name: "Export Hollies", ageMode: "KS1", classCode: code(), teacherId: aTeacher.id, schoolId: aTeacher.schoolId },
  });
  const bTemplate = await db.activityTemplate.create({ data: { title: "Rowans template", teacherId: bTeacher.id } });
  const aTemplate = await db.activityTemplate.create({ data: { title: "Hollies template", teacherId: aTeacher.id } });
  try {
    const tamsin = await db.student.create({ data: { name: "Tamsin", classId: bClass.id } });
    const idris = await db.student.create({ data: { name: "Idris", classId: bClass.id } });
    const orla = await db.student.create({ data: { name: "Orla", classId: aClass.id } });
    const bRun = await db.assignment.create({
      data: { templateId: bTemplate.id, classId: bClass.id, wholeClass: true, status: "LIVE", title: B_TITLE },
    });
    const aRun = await db.assignment.create({
      data: { templateId: aTemplate.id, classId: aClass.id, wholeClass: true, status: "LIVE", title: A_TITLE },
    });
    // Tamsin is marked; Idris, on the same run in the same class, is not.
    // Orla at St Bede's is marked on her own school's run.
    const tamsinMark = await db.assignmentExcusal.create({ data: { assignmentId: bRun.id, studentId: tamsin.id } });
    const orlaMark = await db.assignmentExcusal.create({ data: { assignmentId: aRun.id, studentId: orla.id } });

    // Tamsin's teacher exports Tamsin: her one mark, as a title and a date,
    // and exactly those two fields. toEqual fails on any extra key, which is
    // the guard against a reason, a teacher's name or a class being added.
    await loginTeacher(page, SCHOOL_B.teacher);
    const tamsinRes = await page.request.get(`/teacher/export/pupil/${tamsin.id}`);
    expect(tamsinRes.status()).toBe(200);
    const tamsinBody = await tamsinRes.json();
    expect(tamsinBody.notNeeded, "the marked pupil's file carries the mark").toEqual([
      { activity: B_TITLE, markedAt: tamsinMark.createdAt.toISOString() },
    ]);
    const tamsinRaw = JSON.stringify(tamsinBody);
    expect(tamsinRaw, "a classmate on the same run must not be named").not.toContain("Idris");
    expect(tamsinRaw, "another school's mark must never be in this file").not.toContain(A_TITLE);

    // Idris: same class, same run, no mark. Nothing about the run is in his
    // file, so Tamsin's mark cannot have leaked into it.
    const idrisBody = await (await page.request.get(`/teacher/export/pupil/${idris.id}`)).json();
    expect(idrisBody.pupil.firstName).toBe("Idris");
    expect(idrisBody.notNeeded, "an unmarked pupil's file has no marks").toEqual([]);
    expect(JSON.stringify(idrisBody), "a classmate's mark leaked into this pupil's file").not.toContain(B_TITLE);

    // Oakfield cannot reach Orla's file at all.
    expect((await page.request.get(`/teacher/export/pupil/${orla.id}`)).status(), "School B reached School A's pupil").toBe(404);

    // St Bede's: cannot reach Tamsin's file; its own pupil's file carries its
    // own mark and nothing of Oakfield's. The positive control for the 404.
    await loginTeacher(page, SCHOOL_A.otherTeacher);
    expect((await page.request.get(`/teacher/export/pupil/${tamsin.id}`)).status(), "School A reached School B's pupil").toBe(404);
    const orlaRes = await page.request.get(`/teacher/export/pupil/${orla.id}`);
    expect(orlaRes.status()).toBe(200);
    const orlaBody = await orlaRes.json();
    expect(orlaBody.notNeeded).toEqual([{ activity: A_TITLE, markedAt: orlaMark.createdAt.toISOString() }]);
    expect(JSON.stringify(orlaBody), "School B's mark in School A's file").not.toContain(B_TITLE);
  } finally {
    // Runs (their marks cascade), then classes (their pupils cascade), then
    // the templates the runs pointed at.
    await db.assignment.deleteMany({ where: { templateId: { in: [bTemplate.id, aTemplate.id] } } });
    await db.class.deleteMany({ where: { id: { in: [bClass.id, aClass.id] } } });
    await db.activityTemplate.deleteMany({ where: { id: { in: [bTemplate.id, aTemplate.id] } } });
  }
});

test("deleting a moment erases its media file too (rule 9 — regression guard)", async ({ page }) => {
  // Guards the PR #28 fix: deleteItem must remove the row AND the file. If a
  // future change reverts to a row-only delete, this fails. (The pupil-removal
  // path is still open — see finding F3.)
  const willowId = await studentIdFromLogin(page, SCHOOL_B.classCode, "Willow");
  await loginTeacher(page, SCHOOL_B.teacher);
  await page.goto(`/teacher/students/${willowId}/new`);
  await page.getByRole("button", { name: /photo/i }).click();
  await page.locator('input[type="file"][name="photo"]').setInputFiles(
    path.join(process.cwd(), "tests", "fixtures", "tiny.png"),
  );
  await page.getByRole("button", { name: /add to journal/i }).click();
  await page.waitForURL(/\/teacher\/students\/[^/]+$/);

  const src = await page.locator('img[src^="/uploads/"]').first().getAttribute("src");
  const file = path.join(process.cwd(), ".media", path.basename(src!));
  expect(existsSync(file)).toBe(true);

  await page.goto(`/teacher/students/${willowId}`);
  await page.getByRole("button", { name: /^delete$/i }).first().click();
  await page.waitForLoadState("networkidle");

  expect(existsSync(file), "media file must be erased when a moment is deleted").toBe(false);
});

test("the export carries the family's conversation, held messages and all, and withholds it from staff who may not read it", async ({ page }) => {
  // A subject access request asks what the school HOLDS. Since 7 September that
  // includes a conversation between a child's guardians and their teacher, about
  // the child — so the export carries it, for the same reason rule 3's scope note
  // put work still in the approval queue in the file: a workflow state does not
  // narrow Article 15.
  //
  // THE THREAD IS BUILT HERE RATHER THAN SENT THROUGH THE FAMILY SPACE, and the
  // first version of this test did drive the UI. It passed while creating no
  // message at all: the "it will reach them when the school opens" assertion
  // matched the standing copy that sits under the box whether or not anything
  // was sent, so it was a check that could not fail (FINDINGS F58's class, and
  // the reason this file's other assertions name what they exclude). Sending is
  // covered by messaging-office-hours.spec.ts; what THIS test is about is
  // whether the export discloses what is held, so the held state is arranged
  // directly and the assertion is about the file.
  const zara = await db.student.findFirstOrThrow({
    where: { name: "Zara", class: { classCode: SCHOOL_B.classCode } },
    include: { class: { select: { id: true, schoolId: true, teacherId: true } } },
  });
  const parent = await db.parent.findFirstOrThrow({ where: { children: { some: { id: zara.id } } } });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const thread = await db.messageThread.create({
    data: { studentId: zara.id, schoolId: zara.class.schoolId!, classId: zara.class.id, lastMessageAt: new Date() },
  });
  await db.message.createMany({
    data: [
      // Delivered days ago: an ordinary message.
      {
        threadId: thread.id, senderType: "TEACHER", senderTeacherId: zara.class.teacherId,
        messageBody: "She read beautifully today.",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        deliverAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      // Written at nine at night and still waiting for the school to open. It is
      // on the school's disk, so a request for what they hold must have it.
      {
        threadId: thread.id, senderType: "PARENT", senderParentId: parent.id,
        messageBody: "Please can we talk about reading?",
        createdAt: new Date(), deliverAt: tomorrow,
      },
    ],
  });

  const acorn = await db.class.findFirstOrThrow({ where: { classCode: SCHOOL_B.classCode } });
  const originalTeacher = acorn.teacherId;
  try {
    // Her teacher exports her. Both messages are in the file, including the one
    // nobody at the school can read yet.
    await loginTeacher(page, SCHOOL_B.teacher);
    const mine = await page.request.get(`/teacher/export/pupil/${zara.id}`);
    expect(mine.status()).toBe(200);
    const body = await mine.json();
    const texts = (body.messages ?? []).map((m: { text: string }) => m.text);
    expect(texts).toContain("She read beautifully today.");
    expect(texts, "a held message is held BY THE SCHOOL, so it is disclosed").toContain("Please can we talk about reading?");

    const heldRow = body.messages.find((m: { text: string }) => m.text === "Please can we talk about reading?");
    expect(heldRow.from).toBe("A grown-up at home");
    // Disclosed WITH the time it will arrive, rather than shown as delivered.
    expect(new Date(heldRow.deliveredAt).getTime()).toBeGreaterThan(Date.now());
    // The people who can read it are named, as they already are to the parent.
    expect(body.messageThreadReaders.length).toBeGreaterThan(0);
    // And a teacher's private note to the admin about passing a family on is
    // never in a file handed to that family.
    expect(JSON.stringify(body)).not.toContain("handoverReason");

    // A TEACHING ASSISTANT WHO MAY NOT MESSAGE FAMILIES DOES NOT GET IT. The
    // export must not widen rule 21 by one person — and must not omit the
    // conversation silently either, so the file names it and says who to ask.
    const ta = await db.teacher.findFirstOrThrow({ where: { email: SCHOOL_B.ta.email } });
    await db.class.update({ where: { id: acorn.id }, data: { teacherId: ta.id } });
    await loginTeacher(page, SCHOOL_B.ta);
    const theirs = await page.request.get(`/teacher/export/pupil/${zara.id}`);
    expect(theirs.status(), "the TA holds the class, so the child's own record is theirs to export").toBe(200);
    const taBody = await theirs.json();
    expect(taBody.messages, "a member of staff who may not read the thread does not get it in a file").toEqual([]);
    expect(
      JSON.stringify(taBody.notIncluded),
      "and it is NAMED rather than silently missing, so the school can supply it",
    ).toMatch(/message thread/i);
    expect(JSON.stringify(taBody), "not one word of it may leak").not.toContain("Please can we talk about reading?");
  } finally {
    await db.class.update({ where: { id: acorn.id }, data: { teacherId: originalTeacher } });
    await db.message.deleteMany({ where: { threadId: thread.id } });
    await db.messageThread.deleteMany({ where: { id: thread.id } });
  }
});
