"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { uniqueFamilyCode } from "@/lib/familyCode";
import { deleteOrphanedParents } from "@/lib/erasure";
import { recordAudit } from "@/lib/audit";
import { requireWritableAccount, FROZEN_TEACHER_MESSAGE } from "@/lib/billing";

// ---------------------------------------------------------------------------
// Family access: the teacher's half of letting one household see one child.
//
// The model, and why it is this shape:
//
// A teacher creates a family PLACE for a child. That mints a code and an empty
// Parent row linked to that one child. The teacher never types a name and never
// types an email. They do not know who at home will use it, and StoryJar has no
// business holding a contact detail nobody volunteered. The code travels home on
// paper from the school. The parent redeems it, and only then, and only if they
// want magic links later, do they add their own address.
//
// Consequences worth stating, because the code below only makes sense with them:
//  - StoryJar never sends an unsolicited email to a parent. There is no "you
//    have been added" message anywhere in this file.
//  - The code IS the credential until it is redeemed, so it is generated with
//    the crypto RNG, is never written to the audit log, and is revocable
//    (rotate) and destroyable (remove) by the teacher at any time.
//
// Every action here is ownership-scoped to a pupil in the acting teacher's own
// classes, using the same `where: { id, class: { teacherId } }` the pupil
// journal page uses, and denies by default on anything it cannot prove is theirs
// (SAFEGUARDING rules 4 and 8). All three are audited (rule 16).
// ---------------------------------------------------------------------------

// A pupil this teacher actually teaches, or null. The single ownership check
// every action in this file goes through.
async function ownPupil(studentId: string, teacherId: string) {
  return db.student.findFirst({
    where: { id: studentId, class: { teacherId } },
    select: { id: true, name: true, class: { select: { name: true } } },
  });
}

const NO_PUPIL = "That pupil isn’t available.";
const NO_FAMILY = "That family code isn’t available.";
const NO_CLASS = "That class isn’t available.";

// Give a child's family a way in: a fresh code, and a family place holding
// nothing but the link to that one child.
//
// Write-gated like creating a class: a frozen account is read-only, and handing
// out a NEW route into the data is a write. Rotation and removal below are
// deliberately not gated, because taking access away must never be blocked by
// billing.
export async function createFamilyCode(
  _prev: { error?: string; code?: string; parentId?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; code?: string; parentId?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const gate = await requireWritableAccount();
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  const studentId = String(formData.get("studentId") ?? "");
  const student = await ownPupil(studentId, user.teacher.id);
  if (!student) return { error: NO_PUPIL };

  const code = await uniqueFamilyCode();
  const parent = await db.parent.create({
    // No name, no email. Both stay NULL until the parent fills them in.
    data: { familyCode: code, children: { connect: { id: student.id } } },
    select: { id: true },
  });

  await recordAudit({
    action: "FAMILY_ACCESS_CREATED",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId,
    subjectType: "STUDENT",
    subjectId: student.id,
    detail: `Created family access for ${student.name} in "${student.class.name}"`, // never the code itself
  });

  revalidatePath(`/teacher/students/${student.id}`);
  return { code, parentId: parent.id };
}

// Issue a NEW family code, retiring the current one. The remedy for a letter
// that went astray, and the same shape as rotateClassCode: scoped to the acting
// teacher, NOT write-gated (a leaked code must be revocable in a frozen account
// too), and audited without ever recording the code.
//
// It does not sign anyone out. A parent who has already redeemed the old code
// has a session pointing at their family row, not at the code. Rotation only
// changes what a NEW sign-in must type, which is why the letter needs
// reprinting.
export async function rotateFamilyCode(
  _prev: { error?: string; code?: string; parentId?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; code?: string; parentId?: string }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const studentId = String(formData.get("studentId") ?? "");
  const parentId = String(formData.get("parentId") ?? "");

  const student = await ownPupil(studentId, user.teacher.id);
  if (!student) return { error: NO_PUPIL };

  // The family must be linked to THIS pupil. Scoping through the pupil we have
  // already proved the teacher owns is what stops a tampered parentId reaching
  // another school's family.
  const family = await db.parent.findFirst({
    where: { id: parentId, children: { some: { id: student.id } } },
    select: { id: true },
  });
  if (!family) return { error: NO_FAMILY };

  const code = await uniqueFamilyCode();
  await db.parent.update({ where: { id: family.id }, data: { familyCode: code } });

  await recordAudit({
    action: "FAMILY_CODE_ROTATED",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId,
    subjectType: "STUDENT",
    subjectId: student.id,
    detail: `Issued a new family code for ${student.name}`, // never the code itself
  });

  revalidatePath(`/teacher/students/${student.id}`);
  return { code, parentId: family.id };
}

// Take a family's access to this child away. Immediate: the family view reads
// its children live from the link, so a parent sitting on the page loses the
// child on their next request rather than at the end of their session.
//
// If that was the family's last child the row itself goes, taking its sessions
// and magic tokens with it (deleteOrphanedParents). Not write-gated, because
// removing access is an erasure operation and stays available in a frozen
// account.
export async function removeFamilyAccess(
  _prev: { error?: string; removed?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; removed?: boolean }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const studentId = String(formData.get("studentId") ?? "");
  const parentId = String(formData.get("parentId") ?? "");

  const student = await ownPupil(studentId, user.teacher.id);
  if (!student) return { error: NO_PUPIL };

  const family = await db.parent.findFirst({
    where: { id: parentId, children: { some: { id: student.id } } },
    select: { id: true },
  });
  if (!family) return { error: NO_FAMILY };

  await db.parent.update({
    where: { id: family.id },
    data: { children: { disconnect: { id: student.id } } },
  });
  // Was that their last child? Then nothing of the family survives.
  await deleteOrphanedParents([family.id]);

  await recordAudit({
    action: "FAMILY_ACCESS_REMOVED",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: user.teacher.schoolId,
    subjectType: "STUDENT",
    subjectId: student.id,
    detail: `Removed a family's access to ${student.name}`,
  });

  revalidatePath(`/teacher/students/${student.id}`);
  return { removed: true };
}

// Give every child in ONE class who has no family place a code, in one action.
//
// Why this exists: before it, a teacher starting a class of thirty in September
// opened thirty pupil pages, pressed create thirty times, and printed thirty
// letters one at a time. That is not a feature gap, it is the reason family
// access went unused: the work landed entirely in the first week of term, which
// is the week a teacher has least of it. The whole-class sheet at
// `/teacher/class/[classId]/letters` is the print half; this is the mint half.
//
// What it deliberately does NOT do:
//  - It never touches an existing family place. A child who already has one
//    keeps their code, so pressing this twice is safe and a letter already sent
//    home does not stop working. Rotation stays a per-child, deliberate act.
//  - It never mints a SECOND place for a child who has one. A separated
//    household's extra code is a decision a teacher makes knowingly on the
//    pupil's page, not a side effect of a bulk button.
//  - It writes no code to the audit log, exactly like `createFamilyCode`. One
//    FAMILY_ACCESS_CREATED row per child, naming the child and never the code.
//
// Write-gated for the same reason `createFamilyCode` is: handing out new routes
// into the data is a write, and a frozen account is read-only. Scoped through
// the class, so another teacher's classId finds nothing rather than erroring in
// a way that confirms it exists (SAFEGUARDING rules 4 and 8).
export async function createMissingFamilyCodes(
  _prev: { error?: string; created?: number } | undefined,
  formData: FormData,
): Promise<{ error?: string; created?: number }> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const gate = await requireWritableAccount();
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  const classId = String(formData.get("classId") ?? "");

  const klass = await db.class.findFirst({
    where: { id: classId, teacherId: user.teacher.id },
    select: { id: true, name: true },
  });
  if (!klass) return { error: NO_CLASS };

  // Children in this class with no family place at all. `none: {}` is the whole
  // filter: a child with one household already has a route home.
  const withoutFamily = await db.student.findMany({
    where: { classId: klass.id, parents: { none: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (withoutFamily.length === 0) return { created: 0 };

  // Serial, not Promise.all. `uniqueFamilyCode` mints and then asks the database
  // whether that code is already taken; running thirty of those concurrently
  // means thirty checks racing against writes none of them can see yet, and the
  // unique constraint would surface as a failed action rather than a retry. A
  // class of thirty is small enough that doing it in order costs nothing worth
  // having.
  let created = 0;
  for (const child of withoutFamily) {
    const code = await uniqueFamilyCode();
    await db.parent.create({
      // No name, no email. Both stay NULL until the parent fills them in.
      data: { familyCode: code, children: { connect: { id: child.id } } },
      select: { id: true },
    });
    created += 1;

    await recordAudit({
      action: "FAMILY_ACCESS_CREATED",
      actorType: "TEACHER",
      actorId: user.teacher.id,
      actorName: user.teacher.displayName,
      schoolId: user.teacher.schoolId,
      subjectType: "STUDENT",
      subjectId: child.id,
      detail: `Created family access for ${child.name} in "${klass.name}" (whole-class)`, // never the code itself
    });
  }

  revalidatePath(`/teacher/class/${klass.id}/letters`);
  return { created };
}
