"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deriveTeacherName } from "@/lib/teacherName";
import { recordAudit } from "@/lib/audit";
import { sendStaffInvite } from "@/lib/staffInvite";
import { handOverClasses } from "@/lib/classHandover";
import { makeClassCode } from "@/lib/classCode";

// Resolve the current user as a school admin, or bounce them out. Every admin
// mutation goes through this, so a non-admin (or a teacher with no school) can
// never touch staff/class assignment.
async function requireAdmin(): Promise<{ teacherId: string; schoolId: string; actorName: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (user.teacher.staffRole !== "ADMIN" || !user.teacher.schoolId) redirect("/teacher");
  return { teacherId: user.teacher.id, schoolId: user.teacher.schoolId, actorName: user.teacher.displayName };
}

const ROLES = ["ADMIN", "TEACHER", "TA"];

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

  const existing = await db.teacher.findUnique({ where: { email } });
  if (existing) return { error: "Someone with that email is already on StoryJar." };

  // The school's own name, for the email. Read here rather than threaded
  // through requireAdmin, which is an access check and should stay one.
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { name: true } });
  const schoolName = school?.name ?? "your school";

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
  await sendStaffInvite(created.id, schoolName, email);
  revalidatePath("/admin");
  return {};
}

// Change a staff member's role within the school.
export async function setStaffRole(formData: FormData) {
  const { schoolId, teacherId, actorName } = await requireAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  const role = ROLES.includes(String(formData.get("role"))) ? String(formData.get("role")) : "TEACHER";
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
    select: { id: true, name: true, email: true, school: { select: { name: true } } },
  });
  // Silently back to the console for anything that is not an invited member of
  // this admin's own school: a different answer would let an admin probe ids
  // outside their school.
  if (staff) {
    await sendStaffInvite(staff.id, staff.school?.name ?? "your school", staff.email);
    await recordAudit({
      action: "STAFF_INVITE_RESENT", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
      subjectType: "TEACHER", subjectId: staff.id, detail: `Resent the invitation to ${staff.name}`,
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

  // An invited teacher never set a password and holds nothing; deleting the row
  // cascades their tokens. An ACTIVE one is the case F59 is about.
  let moved: { id: string; name: string }[] = [];
  if (staff.status === "INVITED") {
    await db.teacher.delete({ where: { id: staffId } });
  } else {
    await db.$transaction(async (tx) => {
      moved = await handOverClasses(tx, staffId, teacherId);
      await tx.teacher.update({ where: { id: staffId }, data: { schoolId: null } });
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
    detail:
      moved.length > 0
        ? `Removed ${staff.name} from the school; ${moved.length} ${moved.length === 1 ? "class" : "classes"} moved to ${actorName} and reissued their class codes`
        : `Removed ${staff.name} from the school; they held no classes`,
  });
  revalidatePath("/admin");
}
