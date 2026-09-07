"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentParent } from "@/lib/parentAuth";
import { allowWithinBudget, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";
import { parseMinute, WEEKDAY_NAMES, type DayWindow } from "@/lib/messaging/officeHours";
import { addClosure, removeClosure, saveWindows, setStaffMayMessage } from "@/lib/messaging/policy";
import {
  adminSetHandler,
  adminShareThread,
  adminUnshareThread,
  passThread,
  sendMessage,
  setThreadClosed,
  shareThread,
  takeBackThread,
  unshareThread,
} from "@/lib/messaging/threads";

// ===========================================================================
// Parent messaging — SENDING and the two things a teacher may do to a thread
// (SAFEGUARDING.md rule 21).
//
// Every authorisation happens inside src/lib/messaging/threads.ts against the
// session's own id and the child on the form; an id off a form is never
// trusted on its own. Audit rows record that a message was sent and by which
// role — NEVER the text. A log that quotes a message is a second copy of it
// with a different retention clock.
// ===========================================================================

export type SendState = { error?: string; sent?: { held: boolean; arrives: string | null } };

// A parent writes to their child's teacher.
export async function sendParentMessage(_prev: SendState | undefined, formData: FormData): Promise<SendState> {
  const parent = await getCurrentParent();
  if (!parent) redirect("/family");
  const studentId = String(formData.get("studentId") ?? "");
  const messageBody = String(formData.get("messageBody") ?? "");
  if (!allowWithinBudget(`msg:parent:${parent.id}`)) return { error: RATE_LIMITED_MESSAGE };

  const result = await sendMessage({ kind: "PARENT", parentId: parent.id }, studentId, messageBody);
  if (!result.ok) return { error: result.error };
  await recordAudit({
    action: "MESSAGE_SENT",
    actorType: "PARENT",
    actorId: parent.id,
    schoolId: result.schoolId,
    subjectType: "STUDENT",
    subjectId: studentId,
    detail: `A family wrote to ${result.studentName}’s teacher${result.held ? " (held until school hours)" : ""}`,
  });
  revalidatePath("/family");
  return { sent: { held: result.held, arrives: result.arrives } };
}

// A member of staff replies to a family.
export async function sendStaffMessage(_prev: SendState | undefined, formData: FormData): Promise<SendState> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  const studentId = String(formData.get("studentId") ?? "");
  const messageBody = String(formData.get("messageBody") ?? "");
  if (!allowWithinBudget(`msg:staff:${user.teacher.id}`)) return { error: RATE_LIMITED_MESSAGE };

  const result = await sendMessage({ kind: "TEACHER", teacherId: user.teacher.id }, studentId, messageBody);
  if (!result.ok) return { error: result.error };
  await recordAudit({
    action: "MESSAGE_SENT",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: result.schoolId,
    subjectType: "STUDENT",
    subjectId: studentId,
    detail: `Wrote to ${result.studentName}’s family${result.held ? " (held until school hours)" : ""}`,
  });
  revalidatePath("/teacher/messages");
  revalidatePath(`/teacher/messages/${studentId}`);
  return { sent: { held: result.held, arrives: result.arrives } };
}

type ControlState = { error?: string; done?: string };

// Share a family's conversation with a colleague at the school.
export async function shareFamilyThread(_prev: ControlState | undefined, formData: FormData): Promise<ControlState> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  const studentId = String(formData.get("studentId") ?? "");
  const withTeacherId = String(formData.get("teacherId") ?? "");
  const result = await shareThread(user.teacher.id, studentId, withTeacherId);
  if (!result.ok) return { error: result.error };
  await recordAudit({
    action: "THREAD_SHARED",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: result.schoolId,
    subjectType: "STUDENT",
    subjectId: studentId,
    detail: `Shared ${result.childName}’s family conversation with ${result.targetName}`,
  });
  revalidatePath(`/teacher/messages/${studentId}`);
  return { done: `${result.targetName} can now see this conversation.` };
}

export async function stopSharingFamilyThread(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  const studentId = String(formData.get("studentId") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "");
  const result = await unshareThread(user.teacher.id, studentId, teacherId);
  if (result.ok) {
    await recordAudit({
      action: "THREAD_UNSHARED",
      actorType: "TEACHER",
      actorId: user.teacher.id,
      actorName: user.teacher.displayName,
      schoolId: result.schoolId,
      subjectType: "STUDENT",
      subjectId: studentId,
      detail: `${result.targetName ?? "A colleague"} no longer sees ${result.childName}’s family conversation`,
    });
  }
  revalidatePath(`/teacher/messages/${studentId}`);
  revalidatePath("/teacher/messages");
  // Someone who just dropped their own share has nowhere to go but the inbox.
  if (teacherId === user.teacher.id) redirect("/teacher/messages");
}

// A teacher opts out of one family by passing it to a colleague. The parent is
// not told; the reason, if any, is for the admin and never reaches the audit
// row (it lives on the thread, which the operator area cannot read either).
export async function passFamilyToColleague(_prev: ControlState | undefined, formData: FormData): Promise<ControlState> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  const studentId = String(formData.get("studentId") ?? "");
  const toTeacherId = String(formData.get("teacherId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await passThread(user.teacher.id, studentId, toTeacherId, reason);
  if (!result.ok) return { error: result.error };
  await recordAudit({
    action: "THREAD_PASSED",
    actorType: "TEACHER",
    actorId: user.teacher.id,
    actorName: user.teacher.displayName,
    schoolId: result.schoolId,
    subjectType: "STUDENT",
    subjectId: studentId,
    detail: `Passed ${result.childName}’s family to ${result.targetName}`,
  });
  revalidatePath("/teacher/messages");
  redirect("/teacher/messages");
}

export async function takeFamilyBack(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/login/teacher");
  const studentId = String(formData.get("studentId") ?? "");
  const result = await takeBackThread(user.teacher.id, studentId);
  if (result.ok) {
    await recordAudit({
      action: "THREAD_TAKEN_BACK",
      actorType: "TEACHER",
      actorId: user.teacher.id,
      actorName: user.teacher.displayName,
      schoolId: result.schoolId,
      subjectType: "STUDENT",
      subjectId: studentId,
      detail: `Took ${result.childName}’s family back${result.targetName ? ` from ${result.targetName}` : ""}`,
    });
  }
  revalidatePath("/teacher/messages");
  redirect(`/teacher/messages/${studentId}`);
}

// ===========================================================================
// Parent messaging — the SCHOOL's controls (SAFEGUARDING.md rule 21).
//
// Every action here is admin-only through requireAdmin(). A teacher cannot
// reach any of it: the hours, the switch and who may message parents are the
// school's to govern, which is the whole reason the feature exists. Each write
// re-runs StoryJar's caps on the server (src/lib/messaging/policy.ts) and is
// recorded in the audit log with the adult who did it — never a message body,
// never a child's name.
// ===========================================================================

type FormState = { error?: string; saved?: boolean };

// The seven-row hours form. Each weekday has an "on" checkbox and two times;
// a day that is off simply has no window, which is how "closed" is stored.
export async function saveOfficeHours(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const { teacherId, schoolId, actorName } = await requireAdmin();

  const enabled = formData.get("enabled") === "on";
  const windows: DayWindow[] = [];
  for (let weekday = 0; weekday <= 6; weekday++) {
    if (formData.get(`day-${weekday}`) !== "on") continue;
    const open = parseMinute(String(formData.get(`open-${weekday}`) ?? ""));
    const close = parseMinute(String(formData.get(`close-${weekday}`) ?? ""));
    if (open === null || close === null) {
      return { error: `Enter an opening and a closing time for ${WEEKDAY_NAMES[weekday]}.` };
    }
    windows.push({ weekday, openMinute: open, closeMinute: close });
  }
  if (enabled && windows.length === 0) {
    return { error: "Pick at least one day the school is open before switching messages on." };
  }

  const result = await saveWindows(schoolId, { enabled, windows }, teacherId);
  if (result.error) return { error: result.error };

  await recordAudit({
    action: enabled ? "OFFICE_HOURS_SAVED" : "MESSAGING_SWITCHED_OFF",
    actorType: "ADMIN",
    actorId: teacherId,
    actorName,
    schoolId,
    subjectType: "SCHOOL",
    subjectId: schoolId,
    detail: enabled
      ? `Parent messages ${windows.length === 0 ? "off" : "on"}: ${windows.length} open day${windows.length === 1 ? "" : "s"}${result.moved ? `, ${result.moved} waiting message${result.moved === 1 ? "" : "s"} re-timed` : ""}`
      : `Parent messages switched off${result.moved ? `; ${result.moved} waiting message${result.moved === 1 ? "" : "s"} held` : ""}`,
  });
  revalidatePath("/admin");
  return { saved: true };
}

export async function addOfficeHoursClosure(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const date = String(formData.get("date") ?? "").trim();
  const label = String(formData.get("label") ?? "");
  const result = await addClosure(schoolId, date, label, teacherId);
  if (result.error) return { error: result.error };
  await recordAudit({
    action: "OFFICE_HOURS_CLOSURE_ADDED",
    actorType: "ADMIN",
    actorId: teacherId,
    actorName,
    schoolId,
    subjectType: "SCHOOL",
    subjectId: schoolId,
    detail: `School closed to parent messages on ${date}`,
  });
  revalidatePath("/admin");
  return { saved: true };
}

export async function removeOfficeHoursClosure(formData: FormData): Promise<void> {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const closureId = String(formData.get("closureId") ?? "");
  const { removed } = await removeClosure(schoolId, closureId, teacherId);
  if (removed) {
    await recordAudit({
      action: "OFFICE_HOURS_CLOSURE_REMOVED",
      actorType: "ADMIN",
      actorId: teacherId,
      actorName,
      schoolId,
      subjectType: "SCHOOL",
      subjectId: schoolId,
      detail: "A closure was removed from the parent-messaging calendar",
    });
  }
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Oversight (SAFEGUARDING rules 5 and 21): an admin closes, gives or reassigns
// a conversation without reading it. Each is scoped to the admin's school in
// threads.ts and recorded with the adult who did it.
// ---------------------------------------------------------------------------

export async function setFamilyThreadClosed(formData: FormData): Promise<void> {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const studentId = String(formData.get("studentId") ?? "");
  const closed = formData.get("closed") === "1";
  const result = await setThreadClosed(schoolId, studentId, teacherId, closed);
  if (result.ok) {
    await recordAudit({
      action: closed ? "THREAD_CLOSED" : "THREAD_REOPENED",
      actorType: "ADMIN",
      actorId: teacherId,
      actorName,
      schoolId,
      subjectType: "STUDENT",
      subjectId: studentId,
      detail: `${closed ? "Closed" : "Reopened"} ${result.childName}’s family conversation`,
    });
  }
  revalidatePath("/admin");
}

export async function adminShareFamilyThread(formData: FormData): Promise<void> {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const studentId = String(formData.get("studentId") ?? "");
  const withTeacherId = String(formData.get("teacherId") ?? "");
  const result = await adminShareThread(schoolId, studentId, withTeacherId);
  if (result.ok) {
    await recordAudit({
      action: "THREAD_SHARED",
      actorType: "ADMIN",
      actorId: teacherId,
      actorName,
      schoolId,
      subjectType: "STUDENT",
      subjectId: studentId,
      detail: `Shared ${result.childName}’s family conversation with ${result.targetName}`,
    });
  }
  revalidatePath("/admin");
}

export async function adminStopSharingFamilyThread(formData: FormData): Promise<void> {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const studentId = String(formData.get("studentId") ?? "");
  const withTeacherId = String(formData.get("teacherId") ?? "");
  const result = await adminUnshareThread(schoolId, studentId, withTeacherId);
  if (result.ok) {
    await recordAudit({
      action: "THREAD_UNSHARED",
      actorType: "ADMIN",
      actorId: teacherId,
      actorName,
      schoolId,
      subjectType: "STUDENT",
      subjectId: studentId,
      detail: `${result.targetName ?? "A colleague"} no longer sees ${result.childName}’s family conversation`,
    });
  }
  revalidatePath("/admin");
}

export async function adminSetFamilyHandler(formData: FormData): Promise<void> {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const studentId = String(formData.get("studentId") ?? "");
  const raw = String(formData.get("teacherId") ?? "");
  const result = await adminSetHandler(schoolId, studentId, raw || null);
  if (result.ok) {
    await recordAudit({
      action: raw ? "THREAD_PASSED" : "THREAD_TAKEN_BACK",
      actorType: "ADMIN",
      actorId: teacherId,
      actorName,
      schoolId,
      subjectType: "STUDENT",
      subjectId: studentId,
      detail: raw ? `Gave ${result.childName}’s family to ${result.targetName}` : `Returned ${result.childName}’s family to their class teacher`,
    });
  }
  revalidatePath("/admin");
}

// The per-staff switch on the Staff tab: "default" (the role decides), "yes"
// or "no". A staff member cannot set their own; there is no action for it.
export async function setStaffMessaging(formData: FormData): Promise<void> {
  const { teacherId, schoolId, actorName } = await requireAdmin();
  const staffId = String(formData.get("staffId") ?? "");
  const raw = String(formData.get("value") ?? "default");
  const value = raw === "yes" ? true : raw === "no" ? false : null;
  const result = await setStaffMayMessage(schoolId, staffId, value);
  if (result.ok) {
    await recordAudit({
      action: "STAFF_MESSAGING_CHANGED",
      actorType: "ADMIN",
      actorId: teacherId,
      actorName,
      schoolId,
      subjectType: "TEACHER",
      subjectId: staffId,
      detail: value === null ? `${result.name} may message parents as their role allows` : `${result.name} ${value ? "may" : "may not"} message parents`,
    });
  }
  revalidatePath("/admin");
}
