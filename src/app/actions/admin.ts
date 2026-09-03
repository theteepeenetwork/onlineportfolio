"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deriveTeacherName } from "@/lib/teacherName";
import { recordAudit } from "@/lib/audit";
import { sendStaffInvite } from "@/lib/staffInvite";
import { sendSchoolInvitation } from "@/lib/schoolInvite";
import { handOverClasses } from "@/lib/classHandover";
import { restoreFreePlan } from "@/lib/billing";
import { schoolIsVerified } from "@/lib/schoolClaim";
import { makeClassCode } from "@/lib/classCode";
import {
  SCHOOL_INVITATION_ROLES,
  schoolInvitationExpiry,
} from "@/lib/schoolInvitationPolicy";

// Resolve the current user as a school admin, or bounce them out. Every admin
// mutation goes through this, so a non-admin (or a teacher with no school) can
// never touch staff/class assignment.
async function requireAdmin(): Promise<{ teacherId: string; schoolId: string; actorName: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (user.teacher.staffRole !== "ADMIN" || !user.teacher.schoolId) redirect("/teacher");
  return { teacherId: user.teacher.id, schoolId: user.teacher.schoolId, actorName: user.teacher.displayName };
}

// ONE list, imported rather than retyped. This was a module-private
// `["ADMIN", "TEACHER", "TA"]` — a third copy of the same three words, which
// src/lib/schoolInvitationPolicy.ts asked whoever wired the invitation actions
// to remove. It matters more now than it did: the same value is written to
// `Teacher.role` on one branch of `inviteStaff` and to
// `SchoolInvitation.role` on another, and two arrays that agreed on the day
// they were written would let those branches drift apart.
const ROLES: readonly string[] = SCHOOL_INVITATION_ROLES;

// Invite a member of staff. They join the school as INVITED with no usable
// password until they accept and set one; they can't sign in meanwhile.
export async function inviteStaff(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const { schoolId, teacherId, actorName } = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = ROLES.includes(String(formData.get("role"))) ? String(formData.get("role")) : "TEACHER";
  if (!name) return { error: "Add their name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email doesn’t look quite right." };

  // The school's own name, for the email. Read here rather than threaded
  // through requireAdmin, which is an access check and should stay one.
  //
  // And `verifiedAt`, for two things: the gate immediately below, and the
  // disclosure the invitation carries. It is read BEFORE the address is looked
  // up, created or emailed, because the refusal has to happen before any of
  // those — an invitation refused after the row exists is not a refusal.
  //
  // A MISSING ROW COUNTS AS UNPAID — the same default as `schoolIsVerified` and
  // for the same reason (rule 8). On the disclosure that is also the safe side
  // of the choice: sending it when it was not needed embarrasses nobody, and
  // withholding it when it was is the whole hazard.
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { name: true, verifiedAt: true },
  });
  const schoolName = school?.name ?? "your school";

  // THE FOURTH GATE, AND IT CLOSES THE ROUTE THE OTHER THREE LEFT OPEN.
  //
  // `setStaffRole` may not promote anybody to ADMIN while the school is unpaid.
  // An invitation reaches the same end with one extra step: invite an address
  // you control as ADMIN, accept it, and the unverified school now has a second
  // admin who looks no different from the first. The 1 September decision lists
  // "inviting staff" among the powers an unverified school keeps, and that stays
  // true — it keeps inviting TEACHER and TA, which is what a school setting
  // itself up on a purchase order actually needs.
  //
  // WHY THE MITIGATIONS ARE NOT ENOUGH. While the school stays unverified the
  // second admin is gated exactly as the first is, and accepting needs control
  // of the invited mailbox. Both run out at the worst moment: the instant the
  // invoice is paid, BOTH admins are fully powered — and `detachBuyer` only
  // detaches the buyer, so a refund leaves the second one standing. Owner
  // decision, 2 September 2026.
  //
  // A SENTENCE RATHER THAN A REDIRECT, unlike the other three. This action has
  // an error channel — it returns `{ error }` to a form that renders it — so it
  // can say what is wrong where the admin is looking, and it should.
  if (role === "ADMIN" && !school?.verifiedAt) {
    return {
      error:
        "While the school plan is unpaid you can invite a teacher or a teaching assistant, but not another admin. That opens the moment the payment reaches us.",
    };
  }

  // =========================================================================
  // THE FOUR-CASE BRANCH. What is read here is `{ id, schoolId }`, not merely
  // whether a row exists, because the four cases differ only by `schoolId`.
  //
  //   1. NO ACCOUNT               create an INVITED Teacher row, mail the way in
  //   2. ACCOUNT, schoolId null   write a SchoolInvitation, mail a notification
  //   3. ACCOUNT, this school     refuse: they are already on the console
  //   4. ACCOUNT, another school  refuse, WITHOUT naming the other school
  //
  // WHAT THIS REPLACES, and why it had to go. Until 2 September 2026 every one
  // of these got "Someone with that email is already on StoryJar." — so a
  // teacher who signed up free in September could not be brought into their
  // school when it bought in January, which is the common case and the last
  // thing standing between a school buying and its staff using what it bought
  // (docs/dpo-decisions.md, 2 September 2026).
  //
  // CASES 1 AND 2 MUST LOOK IDENTICAL TO THE ADMIN, and that is a safeguarding
  // property rather than a tidiness one. The old refusal was a plain
  // account-existence oracle: type any address in the country and be told
  // whether that person has a StoryJar account. After this change a schoolless
  // account no longer confirms itself — the same row appears in the staff
  // table, with the same "Invited" label, the same colour, the same audit entry
  // and the same counts on the Overview tab. Case 4 is the only oracle left,
  // and it fires for a strictly smaller set of addresses than the sentence it
  // replaces. Read the notes in src/app/admin/AdminConsole.tsx and
  // src/app/admin/page.tsx before "fixing" any of that sameness.
  //
  // WHAT IS STILL DISTINGUISHABLE, said plainly rather than left to be
  // discovered: the row's ⋯ MENU. An invitation offers "Cancel invitation" and
  // nothing else, because there is no Teacher row in this school to assign a
  // class to or to change a role on. So an admin who opens the menu can still
  // tell which kind of row it is, one click later. Closing that would mean
  // either rendering controls that cannot work or withholding controls a fresh
  // invitation genuinely needs; both are worse. It is recorded here so that the
  // "indistinguishable" claim above is read as the narrow, true one.
  const existing = await db.teacher.findUnique({
    where: { email },
    select: { id: true, schoolId: true },
  });

  if (existing) {
    // ===== AN UNVERIFIED SCHOOL: ONE SENTENCE, THE SAME FOR 2, 3 AND 4 =====
    //
    // Read before `existing.schoolId` is branched on, and before anything is
    // written or sent, so the answer cannot vary with which of the three cases
    // is true. An unpaid school learns nothing here about where — or whether —
    // this adult already works.
    //
    // WHY AN UNVERIFIED SCHOOL MAY NOT DO THIS AT ALL. The 1 September decision
    // keeps "inviting staff" among an unverified school's powers on the stated
    // ground that "an invitation does nothing until the invited teacher
    // accepts". That is true of a brand-new person, who brings nothing — case 1
    // below, which stays open, as two dated decisions and the console's own
    // banner say it does. It is FALSE here: this invitee brings classes, pupils
    // and journals into a stranger's console, and `createTeacherAccount`
    // verifies no address (F67), so anybody at all can raise a purchase order
    // against a school they have nothing to do with. The squatter could not
    // *inherit* the classes — `removeStaff` on an ACTIVE colleague is gated —
    // but the moment a real teacher accepted, the school's admins would see the
    // class names, the pupil counts and that teacher's audit trail.
    // (docs/dpo-decisions.md, 2 September 2026.)
    //
    // WHAT THIS REFUSAL STILL DISCLOSES, honestly: an unverified school that
    // gets this sentence rather than a row has learned that the address has an
    // account. That is exactly the oracle every school had this morning, now
    // narrowed to unverified ones only. Closing it completely would mean
    // refusing case 1 too, which would take away a power two dated decisions
    // grant and which `tests/battery/security/unverified-school-gates.spec.ts`
    // asserts an unpaid school keeps.
    if (!school?.verifiedAt) {
      return {
        error:
          "While the school plan is unpaid you can only invite colleagues who are new to StoryJar. Bringing in someone who already has an account moves their classes and their pupils’ work into this school, so it waits until the payment reaches us.",
      };
    }

    // ===== CASE 3: ALREADY ON THIS SCHOOL =====
    // Refusing discloses nothing: they are visibly on the staff table the admin
    // is looking at.
    if (existing.schoolId === schoolId) {
      return { error: "They’re already on your staff list — their row is in the table below." };
    }

    // ===== CASE 4: ON ANOTHER SCHOOL. NEVER NAME IT. =====
    //
    // Telling an admin WHERE a stranger works is real information about an
    // adult that they did not have a moment ago, and they supplied only an
    // email address to get it. So the sentence is CONDITIONAL — "if they
    // already use StoryJar with another school" — which is a true thing to say
    // to somebody who mistyped an address, and does not confirm on its own that
    // this particular person is on StoryJar at all.
    if (existing.schoolId !== null) {
      return {
        error:
          "That address can’t be added here. If they already use StoryJar with another school, they’ll need to leave it before they can join this one — it’s worth asking them.",
      };
    }

    // ===== CASE 2: AN ACCOUNT WITH NO SCHOOL. THE WHOLE POINT. =====
    //
    // UPSERT, NOT CREATE, and there is deliberately no "resend" anywhere: the
    // model is unique on (teacherId, schoolId), and re-typing the address is
    // the one path that refreshes the offer and sends the notification again.
    // One path, one behaviour — which is the lesson `resendInvite` above was
    // written to record, applied before the second path exists rather than
    // after.
    //
    // The update REOPENS a row the teacher declined or the school revoked, with
    // a fresh clock and `respondedAt` cleared. A school may ask twice; what it
    // may not do is have the old answer still standing while a new offer is
    // live. `state` and `expiresAt` are always written together, because
    // `schoolInvitationIsOpen` reads both and either alone is half a bug.
    //
    // `invitedName` IS THE NAME THE ADMIN TYPED, never the account's own —
    // see the column's comment in prisma/schema.prisma. Rendering the real name
    // would tell an admin what a stranger is called, and would make this row
    // look different from a fresh INVITED one in the staff list.
    //
    // NOTHING IS WRITTEN TO THE TEACHER ROW. She stays ACTIVE, keeps her free
    // plan, keeps her classes and keeps her `schoolId` of null until she
    // accepts. Flipping `status` to "INVITED" instead is the shortcut that
    // would make `removeStaff`'s INVITED branch delete her pupils' drafts and
    // assignment records; the whole reason this model exists is that it does
    // not need to be taken (docs/dpo-decisions.md, 2 September 2026).
    const invitation = await db.schoolInvitation.upsert({
      where: { teacherId_schoolId: { teacherId: existing.id, schoolId } },
      create: {
        schoolId,
        teacherId: existing.id,
        role,
        invitedName: name,
        invitedByTeacherId: teacherId,
        invitedByName: actorName,
        state: "PENDING",
        expiresAt: schoolInvitationExpiry(),
      },
      update: {
        role,
        invitedName: name,
        invitedByTeacherId: teacherId,
        invitedByName: actorName,
        state: "PENDING",
        expiresAt: schoolInvitationExpiry(),
        respondedAt: null,
      },
      select: { id: true },
    });

    // THE SAME AUDIT ACTION AND THE SAME DETAIL AS CASE 1, on purpose. The
    // audit tab is rendered to the same admin as the staff table, so a distinct
    // action here would rebuild the account-existence oracle one tab across.
    // Only `subjectType` and `subjectId` differ, and neither reaches the
    // browser: page.tsx sends the audit's actor, action, detail and time.
    await recordAudit({
      action: "STAFF_INVITED", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
      subjectType: "SCHOOL_INVITATION", subjectId: invitation.id,
      detail: `Invited ${name} as ${role}`,
    });

    await sendSchoolInvitation(email, schoolName, actorName);
    revalidatePath("/admin");
    return {};
  }

  // ===== CASE 1: NO ACCOUNT. UNCHANGED. =====
  const { displayName } = deriveTeacherName({ title: "", fullName: name, displayStyle: "first" });
  const created = await db.teacher.create({
    data: {
      name,
      displayName,
      email,
      passwordHash: "", // set when they accept the invite
      role,
      status: "INVITED",
      schoolId,
    },
  });
  await recordAudit({
    action: "STAFF_INVITED", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
    subjectType: "TEACHER", subjectId: created.id, detail: `Invited ${name} as ${role}`,
  });

  // Send them the way in. Until this line existed, `inviteStaff` created a
  // Teacher row with an empty password hash and told nobody: `staffInviteEmail`
  // had been written, styled and left uncalled (src/lib/mailStatus.ts:48 records
  // that it had no send path), and `resendInvite` below was a no-op refresh. An
  // invited teacher had no route into their own account.
  //
  // Not neutral, and it does not need to be: an admin who just typed the address
  // knows perfectly well whether they typed it. The neutral response belongs to
  // the PUBLIC reset form, where the person asking may not be the person who
  // owns the address.
  await sendStaffInvite(created.id, schoolName, email, {
    paid: Boolean(school?.verifiedAt),
    arrangedBy: actorName,
  });
  revalidatePath("/admin");
  return {};
}

// Change a staff member's role within the school.
export async function setStaffRole(formData: FormData) {
  const { schoolId, teacherId, actorName } = await requireAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  const role = ROLES.includes(String(formData.get("role"))) ? String(formData.get("role")) : "TEACHER";

  // ONLY THE PROMOTION IS GATED. See the long note above `assignClassToStaff`.
  //
  // TEACHER and TA stay live while the school is unpaid, because neither
  // changes what StoryJar permits — the role submenu says so in as many words
  // (F47): what a colleague can see comes from the classes they hold. A school
  // setting itself up on a purchase order needs its staff list to be right.
  // ADMIN is the exception: an unverified admin who can mint a second admin has
  // manufactured somebody who looks no different from a verified one, and that
  // second account outlives any decision taken about the first.
  if (role === "ADMIN" && !(await schoolIsVerified(schoolId))) redirect("/admin?blocked=verify");

  const staff = await db.teacher.findFirst({ where: { id: staffId, schoolId }, select: { name: true } });
  const { count } = await db.teacher.updateMany({ where: { id: staffId, schoolId }, data: { role } });
  if (count > 0) {
    await recordAudit({
      action: "STAFF_ROLE_CHANGED", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
      subjectType: "TEACHER", subjectId: staffId, detail: `Set ${staff?.name ?? "staff"}'s role to ${role}`,
    });
  }
  revalidatePath("/admin");
}

// Move a class's ownership to a staff member (or confirm it already is theirs).
// This IS the access control: whoever teaches the class is the only one who
// sees its children's work.
export async function assignClassToStaff(formData: FormData) {
  const { schoolId, teacherId, actorName } = await requireAdmin();

  // =========================================================================
  // THE VERIFICATION GATE. Until the school has been paid for, this action is
  // refused (docs/dpo-decisions.md, 30 August and 1 September 2026).
  //
  // It is the first of three, and the one the other two are reasoned from:
  // moving a class is how an adult comes to see a class of children's work at
  // all (SAFEGUARDING rule 5), so "who may do this" is the same question as
  // "who has proved they are this school". Self-serve purchase makes buying the
  // act that creates a School and makes the buyer its ADMIN, and on the invoice
  // route the money has not arrived yet — an invoice on 30-day terms is unpaid
  // by definition, and `createTeacherAccount` verifies no email address (F67).
  // On that route these three gates are not a belt beside a brace; they are the
  // whole defence.
  //
  // NOT INSIDE `requireAdmin`, deliberately. That is an access check and stays
  // one; returning a School row from it would make every admin action carry a
  // fact most of them do not need.
  //
  // A REDIRECT WITH A REASON, because this action returns void and there is no
  // error channel to give it. `redirect("/admin")` is already how it refuses an
  // id it does not like, so nothing new is invented here except the query
  // parameter — and that turns a silent bounce into one that lands on a page
  // saying why. The console withholds the control long before this line, so an
  // admin using the screen never arrives; what arrives is a tampered form or a
  // stale tab, and both deserve the sentence rather than a shrug.
  // =========================================================================
  if (!(await schoolIsVerified(schoolId))) redirect("/admin?blocked=verify");

  const staffId = String(formData.get("staffId") ?? "");
  const classId = String(formData.get("classId") ?? "");

  const staff = await db.teacher.findFirst({ where: { id: staffId, schoolId } });
  const klass = await db.class.findFirst({
    where: { id: classId, teacher: { schoolId } },
    select: { id: true, name: true, teacherId: true },
  });
  if (!staff || !klass) redirect("/admin");

  // ROTATE THE CODE ON AN ORDINARY HANDOVER TOO, not only on removal.
  //
  // This is where FINDINGS F66 actually lives. Reassignment moved `teacherId`
  // and nothing else, so the PREVIOUS teacher kept the class code — a bearer
  // credential that signs the holder in as any pupil in the class, needing no
  // session, no token and no password. It fires on the September handover every
  // school performs, with nobody removed from anything, which is why it was live
  // in the product while F59 was still only a defect nobody had triggered.
  //
  // Owner decision, 29 August 2026: rotate on both triggers. The cost is that a
  // routine handover, where nothing at all is wrong, now needs the children told
  // a new code. That was weighed against leaving the worse limb open on the
  // trigger that actually happens.
  //
  // Skipped when the class is already theirs, because "confirm it is already
  // yours" is one of the things this action does and it should not punish a
  // class of children for a no-op.
  const alreadyTheirs = klass.teacherId === staffId;
  await db.$transaction(async (tx) => {
    await tx.class.update({
      where: { id: classId },
      data: {
        teacherId: staffId,
        ...(alreadyTheirs ? {} : { classCode: makeClassCode() }),
      },
    });
  });
  await recordAudit({
    action: "CLASS_ASSIGNED", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
    subjectType: "CLASS", subjectId: classId,
    detail: alreadyTheirs
      ? `Confirmed ${klass.name} is assigned to ${staff.name}`
      : `Assigned ${klass.name} to ${staff.name}, and reissued its class code`,
  });
  revalidatePath("/admin");
}

// "Resend invite" — now genuinely resends. It was a no-op that refreshed the
// page, which is a control that looks like it worked; an admin pressing it for a
// colleague who never received anything got a spinner and no email, twice.
//
// Minting a new token spends the old one (see `mintPasswordToken`), so a resend
// REPLACES the way in rather than adding a second live link to a second inbox.
export async function resendInvite(formData: FormData) {
  const { schoolId, teacherId, actorName } = await requireAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  const staff = await db.teacher.findFirst({
    where: { id: staffId, schoolId, status: "INVITED" },
    // `verifiedAt` for the same reason as `inviteStaff` above: the disclosure
    // belongs on both paths, and a resend reaching a head teacher who never
    // opened the first one is precisely the case it exists for.
    select: {
      id: true,
      name: true,
      email: true,
      school: { select: { name: true, verifiedAt: true } },
    },
  });
  // Silently back to the console for anything that is not an invited member of
  // this admin's own school: a different answer would let an admin probe ids
  // outside their school.
  if (staff) {
    await sendStaffInvite(staff.id, staff.school?.name ?? "your school", staff.email, {
      paid: Boolean(staff.school?.verifiedAt),
      // The admin pressing RESEND, who may not be the one who typed the address
      // — so the copy says "this invitation was sent by", which is true of both,
      // rather than "the account was set up by", which would be a guess.
      arrangedBy: actorName,
    });
    await recordAudit({
      action: "STAFF_INVITE_RESENT", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
      subjectType: "TEACHER", subjectId: staff.id, detail: `Resent the invitation to ${staff.name}`,
    });
  }
  revalidatePath("/admin");
}

// Take back an offer made to a teacher who already has an account.
//
// THERE IS NO "RESEND" BESIDE THIS, deliberately, and no "edit role" either.
// Re-typing the address in the invite form upserts the row and sends the
// notification again — one path, one behaviour — and the role IS the offer, so
// changing it means making a new one.
//
// NOTHING IS DELETED AND NOTHING MOVES. The row goes to REVOKED, which is a
// third value beside DECLINED and SUPERSEDED because a support call asks which
// of the three happened (src/lib/schoolInvitationPolicy.ts). The invitee's
// account, her classes and her pupils are untouched — they were never this
// school's to touch, which is the whole reason the invitation existed.
//
// `respondedAt` IS LEFT NULL. The column means "when the teacher answered", and
// a school taking an offer back is not the teacher answering. `updatedAt` is
// what records when this happened.
//
// NOT GATED ON `verifiedAt`. Every other gate in this file withholds something
// that moves children's work between adults; this one only ever narrows what a
// school is offering, and an unpaid school that typed the wrong address needs
// to be able to withdraw it.
//
// SCOPED BY `schoolId` IN THE WRITE ITSELF, not checked before it. `updateMany`
// with both columns in the `where` cannot be raced or fooled by an id from
// another school's console; a `findUnique` followed by an `update` can be. A
// posted id belonging to School A is simply zero rows updated for School B, and
// the audit row below is written only if something actually changed.
export async function cancelSchoolInvitation(formData: FormData) {
  const { schoolId, teacherId, actorName } = await requireAdmin();
  const invitationId = String(formData.get("invitationId") ?? "");

  // Read first for the NAME ONLY, and scoped to this school, so the audit
  // detail can say who the offer was to. `invitedName` is the name this admin's
  // own school typed; the invitee's real name never enters this action.
  const invitation = await db.schoolInvitation.findFirst({
    where: { id: invitationId, schoolId },
    select: { invitedName: true },
  });

  const { count } = await db.schoolInvitation.updateMany({
    where: { id: invitationId, schoolId, state: "PENDING" },
    data: { state: "REVOKED" },
  });

  if (count > 0) {
    await recordAudit({
      action: "SCHOOL_INVITATION_CANCELLED", actorType: "ADMIN", actorId: teacherId, actorName,
      schoolId, subjectType: "SCHOOL_INVITATION", subjectId: invitationId,
      detail: `Cancelled the invitation to ${invitation?.invitedName ?? "a colleague"}`,
    });
  }
  revalidatePath("/admin");
}

// Remove a member of staff from the school, and take their access with them.
//
// WHAT THIS USED TO DO, and why FINDINGS F59 called it Critical: it set
// `schoolId = null` and stopped. `Class` has no `schoolId` — a class belongs to
// a school only through its teacher — so the classes left the school WITH the
// person, disappearing from the admin's console while `Class.teacherId` still
// pointed at them and every teacher-scoped query still answered. Measured: a
// console went from 5 classes and 17 pupils to 1 and 3, while the removed
// teacher signed back in and still held 4 classes, 14 pupils, 7 journal items
// and 2 items waiting in his approval queue. The audit row said he had been
// removed.
//
// The operation a school performs BECAUSE somebody should no longer see
// children's work — a teacher who has left, or one who has been suspended —
// was silently a no-op.
//
// EVERYTHING NOW HAPPENS IN ONE TRANSACTION, and a failure leaves the state
// untouched rather than half-done. A partial that nulls `schoolId` without
// moving the classes reproduces F59 exactly.
//
// WHERE THE CLASSES GO, and why there is no picker. They go to the admin
// performing the removal, automatically. The scenario that makes this urgent is
// a SUSPENSION, and a head teacher cannot be made to complete a reassignment
// wizard before revoking access — a mandatory picker is friction on the one
// path that must never have any. The consequence is that a non-teaching admin
// acquires children's journals and approval queues, which is a widening of
// SAFEGUARDING rule 5 accepted as an owner decision on 29 August 2026 and
// recorded in docs/dpo-decisions.md with an expiry: it is superseded when
// `Class.schoolId` lands with the school-identity work. Two things make it
// defensible rather than merely convenient, and both ship here rather than
// later — the console FLAGS inherited classes, so the admin's holding is
// visibly temporary, and the button SAYS what is about to move before it is
// pressed.
export async function removeStaff(formData: FormData) {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  if (staffId === teacherId) redirect("/admin"); // can't remove yourself

  const staff = await db.teacher.findFirst({ where: { id: staffId, schoolId } });
  if (!staff) redirect("/admin");

  // THE VERIFICATION GATE, AND IT SITS HERE — AFTER `staff` IS READ — BECAUSE
  // IT DEPENDS ON WHICH BRANCH THE REMOVAL WILL TAKE.
  //
  // Removing an ACTIVE colleague is `assignClassToStaff` wearing a different
  // hat: `handOverClasses` below moves their classes, and their pupils' work,
  // onto whoever pressed the button. The 29 August decision that lets an admin
  // do that with no picker and no friction is about a head teacher suspending
  // somebody, and it assumes a school that has been paid for.
  //
  // AN INVITED ROW STAYS REMOVABLE while unpaid, deliberately: it is an
  // invitation the admin sent minutes ago, they need it to correct a mistyped
  // address, and no colleague loses anything. The decision's reason for keeping
  // it — that it moves nobody's data — is true here only BECAUSE the gate above
  // holds. An invited teacher cannot sign in, so the only way one comes to hold
  // a class is `assignClassToStaff`, which an unverified school cannot reach;
  // if that gate is ever relaxed, this one stops being safe on its own.
  //
  // Written as "not INVITED" rather than "is ACTIVE" so that any status added
  // later is gated by default (SAFEGUARDING rule 8).
  if (staff.status !== "INVITED" && !(await schoolIsVerified(schoolId))) {
    redirect("/admin?blocked=verify");
  }

  // THE CLASSES MOVE FIRST, WHICHEVER BRANCH THIS TAKES. That is F68, and it is
  // the only thing either branch shares.
  //
  // This used to read "an invited teacher never set a password and holds
  // nothing; deleting the row cascades their tokens", and every clause of that
  // was true except the one carrying the weight. An INVITED teacher CAN hold
  // classes: `assignClassToStaff` above resolves its target by id and school
  // with no status filter, and the console offers invited staff in both the
  // class-owner dropdown and the staff row's "Assign classes" — deliberately,
  // because an admin setting up in September wants next term's classes placed
  // before everybody has accepted. `Class.teacher` is `onDelete: Cascade`, and
  // `Student` and `JournalItem` cascade from the class. So the bare delete took
  // the class, its pupils and every piece of work in it, silently, with no audit
  // row and nothing recoverable — while the confirmation said the classes were
  // moving to the admin.
  //
  // The owner's decision (1 September 2026) was hand over first, then delete,
  // with the condition stated as an acceptance criterion rather than an
  // intention: NO WORK IS DELETED IN THE PROCESS. That is asserted by counting
  // classes, pupils, journal items, drafts and assignment records either side of
  // a removal in tests/battery/security/class-handover.spec.ts, not by this
  // comment.
  //
  // THE LINE THAT KEEPS THIS SAFE IS NOT THE HANDOVER — IT IS THAT AN INVITED
  // ROW IS ALWAYS A BRAND-NEW ONE. Read this before changing anything about what
  // `status` means. `Teacher` cascades to `ActivityTemplate`, and from there to
  // `Assignment` and `AssignmentStudent`; it also cascades directly to `Draft`,
  // which the schema itself calls a child's private unfinished work
  // (prisma/schema.prisma:522). None of those pass through `Class`, so
  // `handOverClasses` does not save them and nothing here would.
  //
  // They are unreachable today only because `inviteStaff` above refuses an email
  // that already belongs to a teacher, so an INVITED row is always freshly
  // created with `passwordHash: ""` and can never have authored anything. IF AN
  // ESTABLISHED ACCOUNT CAN EVER CARRY `status = "INVITED"`, THIS BRANCH STARTS
  // DELETING CHILDREN'S DRAFTS AND THE RECORD OF WHICH CHILDREN AN ACTIVITY WAS
  // SET TO. Phase 2 of docs/paid-tier-plan.md's runway brings established
  // accounts into schools and is designed to keep them ACTIVE precisely so this
  // cannot fire; flipping `status` instead would be the shortcut that reopens
  // it. The two extra counts in the spec are what would catch it — and note that
  // `JournalItem.assignmentId` is SET NULL rather than CASCADE, so the work
  // itself would survive while its provenance vanished, which is exactly the
  // kind of loss a journal-item count cannot see.
  //
  // Refusing the assignment at source was considered and rejected: it costs the
  // September workflow the dropdown exists to serve. Nulling `schoolId` instead
  // of deleting was also rejected — it leaves an account nobody can ever sign
  // into, because an invited teacher has no password.
  //
  // IN A TRANSACTION for the reason `handOverClasses` gives: a handover that
  // committed without the delete, or a delete that committed without the
  // handover, is worse than either not happening. The delete still cascades
  // their unspent invitation token, which is the part of the old comment that
  // was right.
  let moved: { id: string; name: string }[] = [];
  const invited = staff.status === "INVITED";
  if (invited) {
    await db.$transaction(async (tx) => {
      moved = await handOverClasses(tx, staffId, teacherId);
      await tx.teacher.delete({ where: { id: staffId } });
    });
  } else {
    await db.$transaction(async (tx) => {
      moved = await handOverClasses(tx, staffId, teacherId);
      // `role` GOES BACK TO TEACHER WITH THE DETACH, and that is not tidying.
      //
      // Nulling `schoolId` alone leaves a schoolless account still carrying
      // `role: "ADMIN"`. It is inert today only because `requireAdmin` needs
      // both — but the invitation work that follows this gives a teacher a
      // route to a NEW `schoolId`, and a removed admin who walked back in as
      // somebody else's admin would hold a privilege nobody granted them,
      // arriving through a door nobody was watching. Rank is not something a
      // person carries between schools.
      //
      // `detachBuyer` (src/lib/schoolClaim.ts) already writes exactly this on
      // the refund path, for the same reason. The two now agree.
      await tx.teacher.update({ where: { id: staffId }, data: { schoolId: null, role: "TEACHER" } });
      // Their own account, on the free plan, from this moment.
      //
      // Detaching used to leave them with NO governing subscription: the school's
      // no longer applies and they may never have had one of their own — invited
      // staff are created by `inviteStaff` above, which writes no subscription,
      // and `joinSchoolPlan` deletes the free row on the way in. The write gate
      // then denies by default (rule 8, right) while `accountStateForTeacher`
      // reports "NONE", so no banner renders and nothing on screen says why every
      // save fails. Worse than frozen. See `restoreFreePlan`.
      //
      // INSIDE THE TRANSACTION, with the detach, for the same reason the class
      // handover is: half of this is worse than none of it.
      //
      // Not in the INVITED branch above — that row is deleted outright, and it
      // never had a subscription to restore.
      await restoreFreePlan(tx, staffId);
      // The open tab. Sessions last 30 days, so without this a suspended
      // teacher stays authenticated for a month after the click. Same shape as
      // the reset in src/app/actions/password.ts.
      await tx.session.deleteMany({ where: { teacherId: staffId } });
      // And any unspent invitation or reset link, which is a live way back INTO
      // the account that was just removed. Nothing revoked these before.
      await tx.teacherPasswordToken.deleteMany({ where: { teacherId: staffId } });
    });
  }

  // Audited AFTER the transaction commits, so no row claims something that was
  // rolled back.
  //
  // ONE ROW PER MOVED CLASS, not a summary on the teacher. A school asking
  // "who held this class, and when did that change" filters subjectType=CLASS
  // and subjectId, and reads the custody history in order — including ordinary
  // reassignments, which already write this shape. A summary row naming only
  // the person would not appear in that query at all.
  //
  // This loop now runs for the INVITED branch too, which is most of the point of
  // F68: the classes moved and nothing said so. The sentence was checked against
  // the case where the person never accepted and needs no branch — "moved from
  // Chris Vale to Mrs Hartley when Chris Vale was removed from the school" is
  // exactly what happened, and it is neutral about why. A wording like "when X
  // was suspended" would not be.
  for (const klass of moved) {
    await recordAudit({
      action: "CLASS_ASSIGNED", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
      subjectType: "CLASS", subjectId: klass.id,
      detail: `${klass.name} moved from ${staff.name} to ${actorName} when ${staff.name} was removed from the school, and its class code was reissued`,
    });
  }
  await recordAudit({
    action: "STAFF_REMOVED", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
    subjectType: "TEACHER", subjectId: staffId,
    // Says the consequence, because F59's specific complaint was that this
    // sentence was false in the direction that mattered.
    //
    // It now names what became of the account too. That is the question this row
    // is read to answer — a head teacher a term later, or the DPO asked "does
    // that person still hold anything of ours" — and "removed from the school"
    // alone leaves it unstated.
    //
    // TWO CLAUSES, BUILT SEPARATELY, because the two branches end differently
    // and one sentence covering both would be false for one of them. An ACTIVE
    // colleague is detached and keeps their own free plan; an INVITED one never
    // set a password, so the row goes with the removal.
    detail:
      (moved.length > 0
        ? `Removed ${staff.name} from the school; ${moved.length} ${moved.length === 1 ? "class" : "classes"} moved to ${actorName} and reissued their class codes`
        : `Removed ${staff.name} from the school; they held no classes`) +
      (invited
        ? ". They had not accepted their invitation, so their account was deleted with it"
        : moved.length > 0
          ? ". Their own StoryJar account stays open on the free plan, with no classes"
          : ". Their own StoryJar account stays open on the free plan"),
  });
  revalidatePath("/admin");
}
