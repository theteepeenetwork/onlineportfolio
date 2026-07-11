"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deriveTeacherName } from "@/lib/teacherName";
import { recordAudit } from "@/lib/audit";

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
  if (existing) return { error: "Someone with that email is already on Storyjar." };

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
  const klass = await db.class.findFirst({ where: { id: classId, teacher: { schoolId } } });
  if (!staff || !klass) redirect("/admin");

  await db.class.update({ where: { id: classId }, data: { teacherId: staffId } });
  await recordAudit({
    action: "CLASS_ASSIGNED", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
    subjectType: "CLASS", subjectId: classId, detail: `Assigned ${klass.name} to ${staff.name}`,
  });
  revalidatePath("/admin");
}

// "Resend invite" — in this build a no-op that just refreshes; a real deployment
// would re-send the email. Kept so the action exists and is admin-guarded.
export async function resendInvite(formData: FormData) {
  const { schoolId } = await requireAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  await db.teacher.findFirst({ where: { id: staffId, schoolId, status: "INVITED" } });
  revalidatePath("/admin");
}

// Remove a staff member from the school. Never yourself. Invited (never-active)
// staff are deleted; active staff are unlinked (their classes are left intact
// and can be reassigned).
export async function removeStaff(formData: FormData) {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  if (staffId === teacherId) redirect("/admin"); // can't remove yourself

  const staff = await db.teacher.findFirst({ where: { id: staffId, schoolId } });
  if (!staff) redirect("/admin");

  if (staff.status === "INVITED") {
    await db.teacher.delete({ where: { id: staffId } });
  } else {
    await db.teacher.update({ where: { id: staffId }, data: { schoolId: null } });
  }
  await recordAudit({
    action: "STAFF_REMOVED", actorType: "ADMIN", actorId: teacherId, actorName, schoolId,
    subjectType: "TEACHER", subjectId: staffId, detail: `Removed ${staff.name} from the school`,
  });
  revalidatePath("/admin");
}
