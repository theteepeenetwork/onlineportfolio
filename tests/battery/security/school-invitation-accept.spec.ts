import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { SCHOOL_A, SCHOOL_B, loginTeacher } from "../helpers";
import { hashPasswordToken } from "@/lib/passwordTokenPolicy";

// ===========================================================================
// ACCEPTING AN INVITATION: the moment a school becomes responsible for another
// teacher's pupils
//
// `joinSchoolPlan` attaches a schoolless teacher to a school, and with her go
// every class she holds and every child in it — not by moving a row, because
// `Class` has no `schoolId`, but because a class belongs to a school through
// the teacher who holds it. One `Teacher.schoolId` write hands over the lot.
// `docs/dpo-decisions.md` (2 September 2026) calls that a controller change and
// requires it to be a thing the teacher does knowingly.
//
// So this file is about the ways it could happen to somebody who did not do it:
//
//   1. CROSS-TENANT FIRST, with a positive control. School A makes an offer to
//      one teacher; a different teacher posts that id. Nothing attaches, and
//      School A's invitation is still PENDING afterwards — the offer must not
//      even be spent by the attempt. The positive control is the same teacher
//      accepting the offer that really is hers, in the same test, so a refusal
//      that came from the action being broken cannot pass for a refusal that
//      came from the guard.
//   2. SINGLE USE. Accepting twice attaches once.
//   3. CLOSED IS CLOSED. Expired, declined and revoked are each refused.
//   4. EXACTLY ONE PLAN GOVERNS afterwards: her FREE row is deleted, once, and
//      nothing else of hers is.
//   5. A SECOND SCHOOL'S OFFER IS SUPERSEDED rather than left standing as a
//      live claim on pupils that are now another school's.
//   6. VERIFICATION IS RE-CHECKED AT ACCEPT. A school that lost it between the
//      invitation and the answer cannot be joined, because this is the moment
//      the data changes hands and not the moment the offer was made.
//
// WHY NOT MISS BROOKFIELD. prisma/seed-test.ts seeds a schoolless free teacher
// for exactly this feature, and she is used by the a11y spec that renders these
// screens. Every test here permanently changes the teacher it acts on, so
// accepting on her behalf would put a shared fixture in a school and take the
// a11y suite with it. These teachers are built and destroyed by this file.
// ===========================================================================

const db = new PrismaClient();

const ALFIE = { email: "accept.alfie@independent.test", password: "password" };
const BETH = { email: "accept.beth@independent.test", password: "password" };
const EMAILS = [ALFIE.email, BETH.email];

// The one sentence every refusal returns, from src/lib/schoolInvitationPolicy.ts.
// A SUBSTRING WITH NO APOSTROPHE IN IT, deliberately. The sentence itself
// carries a typographic apostrophe (isn’t), and a server action's reply is a
// React flight payload in which that character does not survive a `toContain`
// comparison intact. Matching on the clause that has no punctuation in it
// asserts the same sentence and cannot fail for a reason nobody cares about.
const REFUSAL = "may have been answered already, withdrawn, or run out of time";

// An unverified school with a live SCHOOL plan — the real purchase-order state:
// finance sitting on a 30-day invoice must not freeze a school, so the plan
// runs while `verifiedAt` stays null. Built here rather than seeded, because a
// school in this state is a shape no other spec wants to find lying about.
const UNPAID_SCHOOL = "Ashcombe Bridge Primary";

let schoolAId = "";
let schoolBId = "";
let unpaidSchoolId = "";

/**
 * A schoolless teacher exactly as signup leaves one: FREE + ACTIVE + no trial
 * end, one class, two children in it. The class and the children are not
 * decoration — points 1 and 4 are about what does and does not move with her.
 */
async function makeJoiner(
  who: { email: string; password: string },
  name: string,
  className: string,
  opts: { emailConfirmed?: boolean } = {},
) {
  await db.teacher.deleteMany({ where: { email: who.email } });
  const teacher = await db.teacher.create({
    data: {
      name,
      displayName: name.split(" ")[0],
      email: who.email,
      passwordHash: await bcrypt.hash(who.password, 10),
      status: "ACTIVE",
      role: "TEACHER",
      // PROVED BY DEFAULT, so nothing in this file is refused by a gate it is
      // not about. Accepting NOW REQUIRES IT (section 10 below), which is what
      // this line was written in anticipation of: a spec that builds its own
      // teacher gets no `emailConfirmedAt` from anywhere, and every test above
      // would otherwise have quietly become a test of that one gate. Seeded
      // teachers are unaffected — `prisma/seed-test.ts` stamps every one of
      // them in a single pass at the end.
      emailConfirmedAt: opts.emailConfirmed === false ? null : new Date(),
    },
  });
  await db.subscription.create({
    data: { kind: "FREE", status: "ACTIVE", trialEndsAt: null, teacherId: teacher.id },
  });
  const klass = await db.class.create({
    data: { name: className, yearGroup: "Year 3", classCode: className.slice(0, 3).toUpperCase() + "99", teacherId: teacher.id },
  });
  await db.student.createMany({
    data: [
      { name: "Rowan", classId: klass.id, avatarColor: "#8ab9d6" },
      { name: "Tess", classId: klass.id, avatarColor: "#a6c979" },
    ],
  });
  return { teacherId: teacher.id, classId: klass.id };
}

/** A PENDING offer from `schoolId` to `teacherId`, open for the usual fortnight. */
async function offer(
  schoolId: string,
  teacherId: string,
  overrides: { state?: string; expiresAt?: Date; role?: string } = {},
) {
  await db.schoolInvitation.deleteMany({ where: { teacherId, schoolId } });
  return db.schoolInvitation.create({
    data: {
      schoolId,
      teacherId,
      role: overrides.role ?? "TEACHER",
      invitedName: "A Colleague",
      invitedByName: "Mrs Lindqvist",
      state: overrides.state ?? "PENDING",
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });
}

test.beforeAll(async () => {
  schoolAId = (await db.school.findFirstOrThrow({ where: { name: SCHOOL_A.name } })).id;
  schoolBId = (await db.school.findFirstOrThrow({ where: { name: SCHOOL_B.name } })).id;

  await db.school.deleteMany({ where: { name: UNPAID_SCHOOL } });
  const unpaid = await db.school.create({ data: { name: UNPAID_SCHOOL, verifiedAt: null } });
  unpaidSchoolId = unpaid.id;
  await db.subscription.create({
    data: { kind: "SCHOOL", status: "ACTIVE", trialEndsAt: null, schoolId: unpaid.id },
  });
});

test.afterAll(async () => {
  await db.teacher.deleteMany({ where: { email: { in: EMAILS } } });
  await db.school.deleteMany({ where: { name: UNPAID_SCHOOL } });
  await db.$disconnect();
});

// Rebuilt before every test, because every test in this file permanently
// changes the teacher it acts on.
test.beforeEach(async () => {
  await db.teacher.deleteMany({ where: { email: { in: EMAILS } } });
});

// --- Dispatch --------------------------------------------------------------
// Copied rather than shared: a spec file cannot import another spec file
// without registering its tests. The reasoning is in
// join-school-plan-needs-an-invitation.spec.ts.
function compiledActions(): { id: string; exportedName: string; filename: string }[] {
  const dist = path.join(process.cwd(), process.env.NEXT_DIST_DIR || ".next");
  const found: { id: string; exportedName: string; filename: string }[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (entry === "server-reference-manifest.json") {
        try {
          const manifest = JSON.parse(readFileSync(full, "utf8"));
          for (const runtime of ["node", "edge"] as const) {
            for (const [id, v] of Object.entries(manifest[runtime] ?? {})) {
              const rec = v as { exportedName?: string; filename?: string };
              if (rec.exportedName && rec.filename) found.push({ id, exportedName: rec.exportedName, filename: rec.filename });
            }
          }
        } catch {
          // a manifest half-written by a compile in flight is not evidence
        }
        continue;
      }
      if (!entry.includes(".")) walk(full);
    }
  };
  walk(dist);
  return [...new Map(found.map((a) => [a.id, a])).values()];
}

function joinActionId(): string {
  const found = compiledActions().find(
    (a) => a.exportedName === "joinSchoolPlan" && a.filename.endsWith("src/app/actions/billing.ts"),
  );
  expect(
    found,
    "joinSchoolPlan must have an action id, or nothing in this file is dispatching anything",
  ).toBeTruthy();
  return found!.id;
}

/**
 * Press Join with whatever invitation id the test names, from inside the page.
 * `page.request.post({ multipart })` does NOT deliver a server action's
 * FormData — Next hands it an empty one — so a refusal asserted through it
 * passes for the wrong reason. This uses the browser's own encoder and the
 * page's own cookies, which is also a truer model of a tampered client.
 */
async function pressJoin(page: Page, invitationId: string) {
  const id = joinActionId();
  const out = await page.evaluate(
    async ({ id, invitationId }: { id: string; invitationId: string }) => {
      const fd = new FormData();
      fd.append("_1_invitationId", invitationId);
      fd.append("0", '[{},"$K1"]');
      const res = await fetch(location.pathname, {
        method: "POST",
        headers: { "Next-Action": id },
        body: fd,
      });
      return { status: res.status, body: await res.text() };
    },
    { id, invitationId },
  );
  expect(out.status, "a refusal is an answer, not a crash").toBeLessThan(500);
  return out.body;
}

/** Sign in and land on an acceptance screen, which is what compiles the action. */
async function openScreen(page: Page, who: { email: string; password: string }, invitationId: string) {
  await loginTeacher(page, who);
  await page.goto(`/teacher/account/invitation/${invitationId}`);
}

// ===========================================================================
// 1. CROSS-TENANT, WITH A POSITIVE CONTROL
// ===========================================================================
test("one teacher cannot spend another teacher's invitation, and the offer is not even consumed", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");
  const beth = await makeJoiner(BETH, "Beth Rowe", "Hazel");

  // School A asked BETH. Alfie was never asked by School A at all.
  const bethsOffer = await offer(schoolAId, beth.teacherId, {});
  // Alfie has his own, from School B, so he has a screen to stand on and a
  // control to prove the action works when it should.
  const alfiesOffer = await offer(schoolBId, alfie.teacherId, {});

  await openScreen(page, ALFIE, alfiesOffer.id);

  // THE ATTACK: his session, her invitation id.
  const answer = await pressJoin(page, bethsOffer.id);
  expect(answer, "somebody else's invitation is refused in the same words as every other refusal").toContain(REFUSAL);

  const alfieAfterAttack = await db.teacher.findUniqueOrThrow({
    where: { id: alfie.teacherId },
    select: { schoolId: true, role: true, subscription: { select: { kind: true } } },
  });
  expect(alfieAfterAttack.schoolId, "posting School A's invitation must not attach him to School A").toBeNull();
  expect(alfieAfterAttack.subscription?.kind, "and must not touch his own plan").toBe("FREE");

  // THE OFFER ITSELF IS UNTOUCHED. A refusal that consumed the row would let
  // any signed-in teacher burn a colleague's invitation without joining
  // anything — a denial of service on somebody else's job.
  const bethsAfter = await db.schoolInvitation.findUniqueOrThrow({ where: { id: bethsOffer.id } });
  expect(bethsAfter.state, "School A's offer to Beth is still open").toBe("PENDING");
  expect(bethsAfter.respondedAt, "and nobody answered it").toBeNull();

  // And Beth is where she was.
  expect(
    (await db.teacher.findUniqueOrThrow({ where: { id: beth.teacherId } })).schoolId,
    "the teacher who was actually invited is unchanged",
  ).toBeNull();

  // Nothing reached School A's audit log in either name.
  expect(
    await db.auditLog.count({ where: { schoolId: schoolAId, actorId: { in: [alfie.teacherId, beth.teacherId] } } }),
    "a refused acceptance leaves no trace in the inviting school's log",
  ).toBe(0);

  // --- THE POSITIVE CONTROL ------------------------------------------------
  // Same teacher, same session, same button, the invitation that is his. If
  // this did not attach him, every refusal above would be evidence of nothing.
  const ok = await pressJoin(page, alfiesOffer.id);
  expect(ok, "his own invitation is not refused").not.toContain(REFUSAL);

  const alfieAfter = await db.teacher.findUniqueOrThrow({
    where: { id: alfie.teacherId },
    select: { schoolId: true, status: true, role: true },
  });
  expect(alfieAfter.schoolId, "his own invitation really does attach him").toBe(schoolBId);
  expect(alfieAfter.role).toBe("TEACHER");
  // An established account must NEVER carry INVITED: `removeStaff`'s INVITED
  // branch deletes the teacher row outright, cascading to their pupils' drafts
  // and assignment records (docs/dpo-decisions.md, 2 September 2026).
  expect(alfieAfter.status, "an established account stays ACTIVE through a join").toBe("ACTIVE");

  // His classes went with him, which is the whole claim the screen makes — and
  // they went by his `schoolId` alone, because `Class` has no `schoolId`.
  const hisClasses = await db.class.findMany({ where: { teacherId: alfie.teacherId }, select: { id: true } });
  expect(hisClasses.map((c) => c.id), "his class is still his, and now the school's through him").toEqual([alfie.classId]);
});

// ===========================================================================
// 2. SINGLE USE
// ===========================================================================
test("an invitation is spent once, however many times the button is pressed", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");
  const invitation = await offer(schoolBId, alfie.teacherId, {});
  await openScreen(page, ALFIE, invitation.id);

  const first = await pressJoin(page, invitation.id);
  expect(first).not.toContain(REFUSAL);

  const second = await pressJoin(page, invitation.id);
  expect(second, "the second press is refused, in the same words as everything else").toContain(REFUSAL);

  expect((await db.schoolInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).state).toBe("ACCEPTED");
  expect(
    (await db.teacher.findUniqueOrThrow({ where: { id: alfie.teacherId } })).schoolId,
    "she is in the school she joined, once",
  ).toBe(schoolBId);

  // ONE SET OF AUDIT ROWS, not two. A second acceptance that wrote a second
  // controller-change record would put a school's log out of step with what
  // happened to the data.
  expect(
    await db.auditLog.count({ where: { actorId: alfie.teacherId, action: "SCHOOL_INVITATION_ACCEPTED" } }),
    "the controller change is recorded once",
  ).toBe(1);
  expect(
    await db.auditLog.count({ where: { actorId: alfie.teacherId, action: "BILLING_JOINED_SCHOOL" } }),
  ).toBe(1);
});

// ===========================================================================
// 3. CLOSED IS CLOSED
// ===========================================================================
test("expired, declined and revoked invitations are all refused", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");
  // One live offer to stand a screen on. It is from School A and is never
  // pressed, so it cannot be what any refusal below is about.
  const live = await offer(schoolAId, alfie.teacherId, {});
  await openScreen(page, ALFIE, live.id);

  const cases: { label: string; state: string; expiresAt?: Date }[] = [
    { label: "expired a day ago", state: "PENDING", expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    { label: "already declined", state: "DECLINED" },
    { label: "revoked by the school", state: "REVOKED" },
    { label: "already accepted", state: "ACCEPTED" },
    { label: "superseded by another acceptance", state: "SUPERSEDED" },
  ];

  for (const c of cases) {
    const closed = await offer(schoolBId, alfie.teacherId, { state: c.state, expiresAt: c.expiresAt });
    const answer = await pressJoin(page, closed.id);
    expect(answer, `an invitation ${c.label} must be refused`).toContain(REFUSAL);
    expect(
      (await db.teacher.findUniqueOrThrow({ where: { id: alfie.teacherId } })).schoolId,
      `an invitation ${c.label} must not attach anybody`,
    ).toBeNull();
    // The row is left as it was: a refusal is not an answer.
    expect((await db.schoolInvitation.findUniqueOrThrow({ where: { id: closed.id } })).state).toBe(c.state);
  }

  // An id that names nothing at all is refused the same way, and says nothing
  // about whether it was real.
  expect(await pressJoin(page, "not-an-invitation-id")).toContain(REFUSAL);
  expect(await pressJoin(page, "")).toContain(REFUSAL);
});

// ===========================================================================
// 4. EXACTLY ONE PLAN GOVERNS, AND NOTHING ELSE OF HERS IS DELETED
// ===========================================================================
test("her free plan row is deleted exactly once, and her classes, pupils and work are not", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");
  const invitation = await offer(schoolBId, alfie.teacherId, {});

  const before = {
    classes: await db.class.count({ where: { teacherId: alfie.teacherId } }),
    pupils: await db.student.count({ where: { class: { teacherId: alfie.teacherId } } }),
    subs: await db.subscription.count({ where: { teacherId: alfie.teacherId } }),
    code: (await db.class.findUniqueOrThrow({ where: { id: alfie.classId } })).classCode,
  };
  expect(before.subs, "she starts with exactly the row signup writes").toBe(1);

  await openScreen(page, ALFIE, invitation.id);
  expect(await pressJoin(page, invitation.id)).not.toContain(REFUSAL);

  expect(
    await db.subscription.count({ where: { teacherId: alfie.teacherId } }),
    "her own FREE row is gone, so exactly one plan governs her",
  ).toBe(0);
  expect(
    await db.subscription.count({ where: { schoolId: schoolBId } }),
    "and the school's plan is untouched — one row, the one it already had",
  ).toBe(1);

  // THE SCREEN PROMISES NOTHING SHE MADE IS DELETED. This is that promise,
  // counted rather than believed.
  expect(await db.class.count({ where: { teacherId: alfie.teacherId } }), "her classes").toBe(before.classes);
  expect(await db.student.count({ where: { class: { teacherId: alfie.teacherId } } }), "her pupils").toBe(before.pupils);
  // And the other promise: the code on the board does not change, so there is
  // nothing to tell the children.
  expect(
    (await db.class.findUniqueOrThrow({ where: { id: alfie.classId } })).classCode,
    "her class code is unchanged, so nothing needs telling to the children",
  ).toBe(before.code);

  // ONE AUDIT ROW PER CLASS, subjectType CLASS, so a school filtering by class
  // id reads custody in order and a class that arrived this way appears in it.
  const classRows = await db.auditLog.findMany({
    where: { schoolId: schoolBId, subjectType: "CLASS", subjectId: alfie.classId },
    select: { action: true },
  });
  expect(classRows.length, "one row for the class that arrived with her").toBe(1);
  // NOT `CLASS_ASSIGNED`: src/app/admin/page.tsx reads those rows to build the
  // "inherited on removal" flag, and a spurious one would tell an admin they
  // are temporarily holding a colleague's children's work when they are not.
  expect(classRows[0].action, "a class that arrived with its own teacher was not assigned to anybody").not.toBe("CLASS_ASSIGNED");
});

// ===========================================================================
// 5. A SECOND SCHOOL'S OFFER IS SUPERSEDED
// ===========================================================================
test("accepting one school's offer closes every other school's, as superseded", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");
  const fromA = await offer(schoolAId, alfie.teacherId, {});
  const fromB = await offer(schoolBId, alfie.teacherId, {});

  await openScreen(page, ALFIE, fromB.id);
  expect(await pressJoin(page, fromB.id)).not.toContain(REFUSAL);

  const other = await db.schoolInvitation.findUniqueOrThrow({ where: { id: fromA.id } });
  expect(other.state, "the school she did not join gets SUPERSEDED, not DECLINED").toBe("SUPERSEDED");
  // `respondedAt` means "when the teacher answered". She never answered this
  // one, and a timestamp here would say she did.
  expect(other.respondedAt, "nobody answered the offer she did not take").toBeNull();

  // The one she took is ACCEPTED and carries the moment she answered.
  const taken = await db.schoolInvitation.findUniqueOrThrow({ where: { id: fromB.id } });
  expect(taken.state).toBe("ACCEPTED");
  expect(taken.respondedAt).not.toBeNull();

  // AND THE SUPERSEDED OFFER IS NOT A WAY BACK IN. School A's row still names
  // her; pressing it now must not move her from School B to School A.
  const answer = await pressJoin(page, fromA.id);
  expect(answer).toContain(REFUSAL);
  expect(
    (await db.teacher.findUniqueOrThrow({ where: { id: alfie.teacherId } })).schoolId,
    "a superseded offer cannot move a teacher out of the school she joined",
  ).toBe(schoolBId);
});

// ===========================================================================
// 6. VERIFICATION IS RE-CHECKED AT ACCEPT
// ===========================================================================
test("a school that lost verification between inviting and being answered cannot be joined", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");

  // A live offer from a VERIFIED school, so there is a screen to stand on and
  // the refusal below cannot be about the account.
  const good = await offer(schoolBId, alfie.teacherId, {});
  await openScreen(page, ALFIE, good.id);

  // The offer from the school whose payment never arrived. `inviteStaff` would
  // refuse to make this today, which is exactly why it is written directly:
  // the case being tested is a school that was verified when it asked and is
  // not when it is answered, and a refund does that in one webhook.
  const fromUnpaid = await offer(unpaidSchoolId, alfie.teacherId, {});
  const answer = await pressJoin(page, fromUnpaid.id);
  expect(answer, "an unverified school is refused at accept, in the same words").toContain(REFUSAL);
  expect(
    (await db.teacher.findUniqueOrThrow({ where: { id: alfie.teacherId } })).schoolId,
    "nobody's pupils pass to a school whose payment has not arrived",
  ).toBeNull();
  expect(
    (await db.schoolInvitation.findUniqueOrThrow({ where: { id: fromUnpaid.id } })).state,
    "and the offer is not consumed by the refusal",
  ).toBe("PENDING");

  // THE SCREEN AGREES WITH THE ACTION. If it rendered the whole controller
  // change and offered a button that could only refuse, the sentence the
  // button returns would be false: the invitation IS open, the school has not
  // paid. Both sides read `verifiedAt`, so the teacher never meets that.
  await page.goto(`/teacher/account/invitation/${fromUnpaid.id}`);
  await expect(page.getByRole("button", { name: /^Join / })).toHaveCount(0);
  await expect(page.getByText(REFUSAL)).toBeVisible();
  // And it does not tell her which school it was, or that a school has not
  // paid its bill. Neither is hers to be given by us.
  await expect(page.getByText(UNPAID_SCHOOL)).toHaveCount(0);

  // The positive control: the verified school's offer still works.
  expect(await pressJoin(page, good.id)).not.toContain(REFUSAL);
  expect((await db.teacher.findUniqueOrThrow({ where: { id: alfie.teacherId } })).schoolId).toBe(schoolBId);
});

// ===========================================================================
// 7. THE SCREEN ITSELF IS SCOPED BY THE SESSION
// ===========================================================================
test("the acceptance screen will not render somebody else's invitation", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");
  const beth = await makeJoiner(BETH, "Beth Rowe", "Hazel");
  const bethsOffer = await offer(schoolAId, beth.teacherId, {});

  await loginTeacher(page, ALFIE);
  await page.goto(`/teacher/account/invitation/${bethsOffer.id}`);

  // The single refusal sentence and nothing else: no school name, no inviter,
  // no button. A signed-in teacher pasting a colleague's link learns nothing
  // from the difference between a wrong id and somebody else's id.
  await expect(page.getByText(REFUSAL)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Join / })).toHaveCount(0);
  await expect(page.getByText(SCHOOL_A.name)).toHaveCount(0);
  await expect(page.getByText("Mrs Lindqvist")).toHaveCount(0);
  // Nor does it leak the other teacher's class.
  await expect(page.getByText("Hazel")).toHaveCount(0);
});

// ===========================================================================
// 8. DECLINING
// ===========================================================================
test("declining answers the offer, keeps everything, and cannot be aimed at somebody else", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");
  const beth = await makeJoiner(BETH, "Beth Rowe", "Hazel");
  const alfies = await offer(schoolBId, alfie.teacherId, {});
  const beths = await offer(schoolAId, beth.teacherId, {});

  await openScreen(page, ALFIE, alfies.id);

  // Aim the decline at Beth's invitation by tampering with the form the server
  // rendered — the id is a hidden input, and this is what a tampered client
  // really does.
  await page.locator('form input[name="invitationId"]').last().evaluate((el, id) => {
    (el as HTMLInputElement).value = id;
  }, beths.id);
  await page.getByRole("button", { name: /no thank you/i }).click();
  await page.waitForURL((url) => url.pathname === "/teacher/account");

  expect(
    (await db.schoolInvitation.findUniqueOrThrow({ where: { id: beths.id } })).state,
    "one teacher cannot decline another teacher's invitation",
  ).toBe("PENDING");
  expect(
    await db.auditLog.count({ where: { subjectId: beths.id } }),
    "and a miss writes nothing into anybody's audit log",
  ).toBe(0);

  // Now his own, honestly.
  await page.goto(`/teacher/account/invitation/${alfies.id}`);
  await page.getByRole("button", { name: /no thank you/i }).click();
  await page.waitForURL((url) => url.pathname === "/teacher/account");

  const declined = await db.schoolInvitation.findUniqueOrThrow({ where: { id: alfies.id } });
  expect(declined.state, "the row is answered, not deleted — the school is entitled to see it was").toBe("DECLINED");
  expect(declined.respondedAt, "and when").not.toBeNull();

  // Nothing of his moved.
  const after = await db.teacher.findUniqueOrThrow({
    where: { id: alfie.teacherId },
    select: { schoolId: true, subscription: { select: { kind: true, status: true } } },
  });
  expect(after.schoolId, "declining leaves him schoolless").toBeNull();
  expect(after.subscription?.kind, "and on his own free plan").toBe("FREE");
  expect(after.subscription?.status).toBe("ACTIVE");
  expect(await db.class.count({ where: { teacherId: alfie.teacherId } })).toBe(1);
});

// ===========================================================================
// 9. THE SCHOOL'S PLAN MUST STILL BE ABLE TO WRITE
//
// Guard 6 used to read `kind` and never `status`, and the two facts it needed
// are both sticky: `School.verifiedAt` is stamped at payment and never cleared
// by a later lapse, and a school `Subscription` is never deleted —
// `customer.subscription.deleted` routes to `freezeSubscription`. So a school
// that paid and then stopped paying keeps `verifiedAt` and keeps a
// `kind: "SCHOOL"` row at FROZEN, and it passed guards 4 and 6 together. A
// fortnight is comfortably long enough for a card to fail inside an open
// invitation.
//
// WHAT THE TEACHER GOT FOR PRESSING JOIN, and why this is a security test and
// not a billing one: step 3 deletes her own FREE row, which RETENTION.md says
// in terms has no billing route into FROZEN at all, and leaves her governed by
// one that is frozen right now. `requireWritableAccount` gates
// src/app/actions/journal.ts, so from that instant the children in her class
// cannot hand work in and she cannot approve what is already waiting. The
// approval queue stops, on an action whose screen told her she carries on
// teaching the same classes in the same way.
//
// ONE SCHOOL, ONE COLUMN, THREE VALUES. The school below is created FROZEN,
// then set to a TRIAL that ran out, then to ACTIVE, and the same invitation is
// pressed each time. Nothing else about it changes between the presses, so a
// refusal cannot be explained by the school, the teacher, the offer, or the
// account: it differs by `Subscription.status` alone.
//
// THE LAPSED TRIAL IS NOT A THIRD FLAVOUR OF THE SAME CASE. It is the reason
// the guard settles the status instead of reading the column: that row still
// says the word "TRIAL" in the database until something asks, so a raw
// comparison against the writable statuses would let it straight through.
//
// BUILT AND DESTROYED HERE. School C (Larchwood) is the seeded frozen school
// and other specs assert its state; widening it into this file's fixture would
// make those specs depend on this one.
// ===========================================================================
const LAPSED_SCHOOL = "Cranmere Fields Primary";

test("a school whose plan has stopped paying cannot be joined, and her free plan survives the refusal", async ({ page }) => {
  await db.school.deleteMany({ where: { name: LAPSED_SCHOOL } });
  // VERIFIED, because this school really did pay once. That is the whole
  // point: `verifiedAt` outlives the money, so guard 4 waves it through and
  // guard 6 is the only thing left standing between it and her class.
  const school = await db.school.create({
    data: { name: LAPSED_SCHOOL, verifiedAt: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000) },
  });
  const plan = await db.subscription.create({
    data: {
      kind: "SCHOOL",
      status: "FROZEN",
      frozenAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      schoolId: school.id,
    },
  });

  try {
    const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow");
    const invitation = await offer(school.id, alfie.teacherId, {});

    await openScreen(page, ALFIE, invitation.id);

    // --- THE SCREEN ------------------------------------------------------
    // The whole controller change is not explained and no button is offered,
    // because the press would only refuse. The one sentence, and no school
    // name in it: that a school has stopped paying its bill is a fact about
    // the school and not hers to be given by us.
    await expect(page.getByText(REFUSAL)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Join / })).toHaveCount(0);
    await expect(page.getByText(LAPSED_SCHOOL)).toHaveCount(0);

    // --- THE BANNER, ON A SCREEN THAT IS NOT THIS ONE --------------------
    // It follows a teacher around every page in the product, so it is the
    // surface that would name the school loudest.
    await page.goto("/teacher");
    await expect(page.getByText(LAPSED_SCHOOL)).toHaveCount(0);
    await expect(page.getByText("has asked you to join")).toHaveCount(0);

    // --- THE CARD --------------------------------------------------------
    await page.goto("/teacher/account");
    await expect(page.getByText(LAPSED_SCHOOL)).toHaveCount(0);
    await expect(page.getByText("A school has asked you to join it")).toHaveCount(0);

    // --- THE PRESS -------------------------------------------------------
    // A tampered client that never saw any of the above, which is the only
    // way this id gets posted now.
    await page.goto(`/teacher/account/invitation/${invitation.id}`);
    expect(
      await pressJoin(page, invitation.id),
      "a frozen school is refused in the same words as every other refusal",
    ).toContain(REFUSAL);

    // THE ASSERTION THAT MATTERS MOST. A refusal that had already deleted her
    // FREE row would be worse than the bug it fixes: she would be schoolless
    // AND governed by nothing, which `requireWritableAccountForTeacher` reads
    // as UNKNOWN and denies. Her plan is untouched, and so is she.
    const after = await db.teacher.findUniqueOrThrow({
      where: { id: alfie.teacherId },
      select: { schoolId: true, subscription: { select: { kind: true, status: true } } },
    });
    expect(after.schoolId, "nobody's pupils pass to a school that has stopped paying").toBeNull();
    expect(after.subscription?.kind, "and her own free plan is still there").toBe("FREE");
    expect(after.subscription?.status, "still ACTIVE, still writable, still hers").toBe("ACTIVE");
    expect(
      (await db.schoolInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).state,
      "and the offer is not consumed by the refusal",
    ).toBe("PENDING");

    // --- THE SAME OFFER, FROM A SCHOOL ON A TRIAL THAT RAN OUT -----------
    // The column now says TRIAL, which IS one of the writable statuses. Only
    // `settleStatus` knows it is not: no live Stripe subscription and a trial
    // end in the past. A guard reading the column would join her to it.
    await db.subscription.update({
      where: { id: plan.id },
      data: {
        status: "TRIAL",
        frozenAt: null,
        stripeSubscriptionId: null,
        trialEndsAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
    });

    await page.goto("/teacher/account");
    await expect(page.getByText(LAPSED_SCHOOL), "a lapsed trial is not advertised either").toHaveCount(0);

    await page.goto(`/teacher/account/invitation/${invitation.id}`);
    await expect(page.getByText(REFUSAL)).toBeVisible();
    expect(
      await pressJoin(page, invitation.id),
      "a trial that ran out is refused even though the column still says TRIAL",
    ).toContain(REFUSAL);
    expect(
      (await db.teacher.findUniqueOrThrow({ where: { id: alfie.teacherId } })).schoolId,
      "a lapsed trial does not take a class of children either",
    ).toBeNull();
    // And the settle really did settle: asking froze it, exactly as the daily
    // sweep would have.
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { id: plan.id } })).status,
      "settleStatus froze the lapsed trial as it answered",
    ).toBe("FROZEN");

    // --- THE POSITIVE CONTROL --------------------------------------------
    // Same school, same offer, same teacher, same button. One column moves.
    await db.subscription.update({
      where: { id: plan.id },
      data: { status: "ACTIVE", frozenAt: null, trialEndsAt: null },
    });

    // The surfaces come back, which is what proves they were withheld by this
    // clause rather than broken by it.
    await page.goto("/teacher/account");
    await expect(page.getByText(LAPSED_SCHOOL).first()).toBeVisible();

    await page.goto(`/teacher/account/invitation/${invitation.id}`);
    await expect(page.getByRole("button", { name: /^Join / })).toBeVisible();

    // AND THE SCREEN SAYS WHAT SHE IS MOVING ONTO. Joining a school in perfect
    // health still takes her off a plan with no billing route into FROZEN and
    // puts her on one that has both a pause and a deletion clock. Leaving that
    // out made joining look costless, which on a screen whose own component
    // invokes the Children's Code on nudging is itself a nudge.
    await expect(page.getByText(/including if the school stops paying for it/)).toBeVisible();
    await expect(page.getByText(/deleted after 12 months/)).toBeVisible();
    // And that "they cannot see the work unless they teach the class" is a
    // softer claim than it sounds, because an admin can arrange to teach it.
    await expect(page.getByText(/move a class to a different teacher, including themselves/)).toBeVisible();

    expect(
      await pressJoin(page, invitation.id),
      "a school that is paying is joined, so every refusal above was the status",
    ).not.toContain(REFUSAL);

    const joined = await db.teacher.findUniqueOrThrow({
      where: { id: alfie.teacherId },
      select: { schoolId: true, status: true, subscription: { select: { kind: true } } },
    });
    expect(joined.schoolId, "her own invitation to a paying school really does attach her").toBe(school.id);
    expect(joined.status, "an established account stays ACTIVE through a join").toBe("ACTIVE");
    expect(joined.subscription, "and now exactly one plan governs her: the school's").toBeNull();
  } finally {
    // The school goes whatever happened above. `SchoolInvitation` and
    // `Subscription` both cascade from it, and the teacher is rebuilt by
    // `beforeEach` and removed by `afterAll`.
    await db.teacher.updateMany({ where: { schoolId: school.id }, data: { schoolId: null } });
    await db.school.deleteMany({ where: { id: school.id } });
  }
});

// ===========================================================================
// 10. ACCEPTING REQUIRES A PROVED EMAIL ADDRESS
//
// Owner decision, phase 2's Rule 1 review. Signup proves no address at all
// (F67, still open), so an account registered against head@realschool.sch.uk
// by somebody who does not hold that mailbox could answer an offer the school
// aimed at that mailbox.
//
// WHY THIS IS NOT SIMPLY F67 IN A SECOND PLACE. Every other route into a
// school proves the mailbox by construction: `inviteStaff` case 1 MAILS a
// bearer token, so only the mailbox holder can ever set the password;
// `claimSchool` requires `emailConfirmedAt`; `setStaffRole` can only promote
// somebody who is already inside the school by one of those. Acceptance was
// the first path where the SCHOOL names an address and somebody other than its
// holder can answer — and an invitation that carried ADMIN is one
// `assignClassToStaff` press from every child's work in the school, because an
// admin may move any class to any member of staff, themselves included.
//
// WHAT A REFUSAL MUST NOT HAVE DONE, and it is asserted every time rather than
// once: it must not have consumed the invitation, deleted her FREE row, or
// moved a class. A refusal that had already deleted her plan would leave her
// schoolless AND governed by nothing, which is worse than the bug.
//
// AND THE MAIL IS COUNTED WITH A CONTROL. "No mail here, mail there" passes
// identically in an environment where mail is broken everywhere, so the
// counted delta is taken across the SAME teacher pressing the SAME button
// either side of confirming her address: one press sends, the next sends
// nothing and joins her instead.
// ===========================================================================

/** The refusal this section is about, matched on the clause with no punctuation. */
const NEEDS_EMAIL = "we need to know we can reach you";

/** How many confirmation emails StoryJar has tried to send, across every outcome. */
async function confirmMailAttempts(): Promise<number> {
  const rows = await db.mailCounter.findMany({ where: { templateKey: "email-confirm" } });
  return rows.reduce((n, r) => n + r.count, 0);
}

/**
 * Put a usable confirmation link in front of a teacher and hand back the raw
 * value, the way `email-confirmation-before-buying.spec.ts` does.
 *
 * The raw value is never stored, so a test cannot read the one the refusal
 * just emailed; it writes its own through the SAME digest the application
 * uses. Opening it walks the real route, so what proves the gate open is the
 * link a teacher would actually be sent, not a column poked in the database.
 */
async function plantConfirmToken(teacherId: string): Promise<string> {
  const raw = `test-confirm-${teacherId}-${Date.now()}`;
  await db.teacherPasswordToken.create({
    data: {
      resetHash: hashPasswordToken(raw),
      teacherId,
      purpose: "CONFIRM",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return raw;
}

test("a teacher who has not proved her address cannot accept, is told why, and is emailed a link", async ({ page }) => {
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow", { emailConfirmed: false });
  const invitation = await offer(schoolAId, alfie.teacherId, {});

  await openScreen(page, ALFIE, invitation.id);

  // --- THE SCREEN ------------------------------------------------------
  // NOT the frozen-school treatment. That one hides the page behind one
  // sentence because the reason is a fact about the school and not hers to be
  // given by us. This reason is a fact about HER OWN account, she can fix it in
  // the next minute, and she should be able to read what accepting means while
  // she waits for the email. So the whole argument is still here.
  await expect(page.getByText(/If you leave/).first()).toBeVisible();
  await expect(page.getByText(/deleted after 12 months/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Join / })).toBeVisible();

  // And she is told BEFORE the press, which is the fault fixed for an
  // unverified school and again for a frozen plan: the whole argument, a
  // button, and only then a refusal nobody warned her about.
  await expect(page.getByRole("heading", { name: /confirm your email address first/i })).toBeVisible();
  await expect(page.getByText(ALFIE.email).first(), "a typo made at signup is visible at the moment it costs something").toBeVisible();

  // --- THE PRESS -------------------------------------------------------
  const mailBefore = await confirmMailAttempts();
  const answer = await pressJoin(page, invitation.id);

  expect(answer, "an unproved address cannot take a class of children into a school").toContain(NEEDS_EMAIL);
  expect(answer, "and the sentence names her address").toContain(ALFIE.email);
  // NOT the one-sentence invitation refusal. That would be false — the offer is
  // open — and useless: it would send her to ask her school's admin for a
  // replacement that would be refused in exactly the same way.
  expect(answer, "this refusal is about her account, not about the invitation").not.toContain(REFUSAL);

  // --- WHAT THE REFUSAL MUST NOT HAVE DONE ------------------------------
  const after = await db.teacher.findUniqueOrThrow({
    where: { id: alfie.teacherId },
    select: {
      schoolId: true,
      role: true,
      emailConfirmedAt: true,
      subscription: { select: { kind: true, status: true } },
    },
  });
  expect(after.schoolId, "nobody's pupils pass to a school on an unproved address").toBeNull();
  expect(after.role, "and no role is granted by a refusal").toBe("TEACHER");
  expect(after.emailConfirmedAt, "and the gate certainly does not confirm the address it just refused").toBeNull();
  expect(after.subscription?.kind, "her own free plan is still there").toBe("FREE");
  expect(after.subscription?.status, "still ACTIVE, still writable, still hers").toBe("ACTIVE");
  expect(
    (await db.schoolInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).state,
    "and the offer is not spent by the attempt",
  ).toBe("PENDING");
  expect(await db.class.count({ where: { teacherId: alfie.teacherId } }), "and her class is where it was").toBe(1);
  expect(await db.student.count({ where: { class: { teacherId: alfie.teacherId } } })).toBe(2);

  // --- WHAT IT DID DO ---------------------------------------------------
  // Refusing without sending anything would be refusing her twice: there is no
  // resend button anywhere in the product, and pressing Join IS the resend.
  const tokens = await db.teacherPasswordToken.findMany({ where: { teacherId: alfie.teacherId } });
  expect(tokens, "a refusal that sends no link leaves her nowhere to go").toHaveLength(1);
  expect(tokens[0].purpose).toBe("CONFIRM");
  expect(tokens[0].usedAt, "and the link must still be spendable").toBeNull();
  const mailAfterRefusal = await confirmMailAttempts();
  expect(
    mailAfterRefusal - mailBefore,
    "the confirmation must be counted where an operator can see it",
  ).toBeGreaterThan(0);

  // --- THE POSITIVE CONTROL, AND THE MAIL CONTROL WITH IT ---------------
  // The same teacher, the same offer, the same button. One column moves, and
  // it moves by opening a real confirmation link rather than by writing to the
  // column directly.
  const raw = await plantConfirmToken(alfie.teacherId);
  await page.goto(`/confirm-email?token=${raw}`);
  expect(
    (await db.teacher.findUniqueOrThrow({ where: { id: alfie.teacherId } })).emailConfirmedAt,
    "opening the link proves the address",
  ).not.toBeNull();

  await page.goto(`/teacher/account/invitation/${invitation.id}`);
  await expect(
    page.getByRole("heading", { name: /confirm your email address first/i }),
    "and the screen stops asking",
  ).toHaveCount(0);

  const joined = await pressJoin(page, invitation.id);
  expect(joined, "a proved address is not stopped by this gate").not.toContain(NEEDS_EMAIL);
  expect(joined, "nor by any other").not.toContain(REFUSAL);

  const now = await db.teacher.findUniqueOrThrow({
    where: { id: alfie.teacherId },
    select: { schoolId: true, status: true, subscription: { select: { kind: true } } },
  });
  expect(now.schoolId, "so every refusal above was the address and nothing else").toBe(schoolAId);
  expect(now.status, "an established account stays ACTIVE through a join").toBe("ACTIVE");
  expect(now.subscription, "and exactly one plan governs her now: the school's").toBeNull();
  expect(
    (await db.schoolInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).state,
  ).toBe("ACCEPTED");

  // THE CONTROL THE MAIL ASSERTION NEEDS. A "mail here, none there" pair passes
  // identically when mail is broken everywhere; this is the same teacher and
  // the same button, and the successful press sends nothing at all.
  expect(
    await confirmMailAttempts(),
    "a teacher who has proved her address is emailed nothing when she joins",
  ).toBe(mailAfterRefusal);
});

test("the refusal is the same whatever the invitation offered — it is never a role oracle", async ({ page }) => {
  // THE NARROWER GATE WAS CONSIDERED AND REJECTED: requiring proof only for
  // ADMIN would tell the recipient what she had been offered before she
  // answered it, and a TEACHER invitation hands over the same children's work
  // in the same transaction anyway. The four invitation cases are built to look
  // alike and this one must not be the seam that tells them apart.
  const beth = await makeJoiner(BETH, "Beth Rowe", "Hazel", { emailConfirmed: false });
  const asAdmin = await offer(schoolBId, beth.teacherId, { role: "ADMIN" });

  await openScreen(page, BETH, asAdmin.id);
  const answer = await pressJoin(page, asAdmin.id);

  expect(answer, "an ADMIN invitation is refused in the same words as any other").toContain(NEEDS_EMAIL);
  expect(answer, "and the refusal never mentions what was offered").not.toMatch(/\badmin\b/i);

  const after = await db.teacher.findUniqueOrThrow({
    where: { id: beth.teacherId },
    select: { schoolId: true, role: true },
  });
  expect(after.schoolId, "an unproved address does not become an admin of a school").toBeNull();
  expect(after.role, "and is granted nothing").toBe("TEACHER");
  expect((await db.schoolInvitation.findUniqueOrThrow({ where: { id: asAdmin.id } })).state).toBe("PENDING");
});

test("declining needs no proved address, because saying no reaches nothing", async ({ page }) => {
  // DELIBERATELY NOT GATED. Making somebody prove an address in order to REFUSE
  // is friction with no safeguarding purpose: nothing of anybody's moves, and a
  // teacher who cannot say no is left with a live offer she does not want.
  const alfie = await makeJoiner(ALFIE, "Alfie Nunn", "Willow", { emailConfirmed: false });
  const invitation = await offer(schoolBId, alfie.teacherId, {});
  const mailBefore = await confirmMailAttempts();

  await openScreen(page, ALFIE, invitation.id);
  await page.getByRole("button", { name: /no thank you/i }).click();
  await page.waitForURL((url) => url.pathname === "/teacher/account");

  const declined = await db.schoolInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
  expect(declined.state, "an unproved teacher can still answer no").toBe("DECLINED");
  expect(declined.respondedAt).not.toBeNull();
  expect(
    await confirmMailAttempts(),
    "and declining sends her no confirmation email, because it asks nothing of her address",
  ).toBe(mailBefore);

  const after = await db.teacher.findUniqueOrThrow({
    where: { id: alfie.teacherId },
    select: { schoolId: true, emailConfirmedAt: true, subscription: { select: { kind: true } } },
  });
  expect(after.schoolId).toBeNull();
  expect(after.emailConfirmedAt, "and nothing about her account changed").toBeNull();
  expect(after.subscription?.kind).toBe("FREE");
});
