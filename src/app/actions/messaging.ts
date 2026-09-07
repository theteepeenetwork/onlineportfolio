"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import { recordAudit } from "@/lib/audit";
import { parseMinute, WEEKDAY_NAMES, type DayWindow } from "@/lib/messaging/officeHours";
import { addClosure, removeClosure, saveWindows, setStaffMayMessage } from "@/lib/messaging/policy";

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
      detail: `${result.name} ${value === null ? "back to the default for their role" : value ? "may" : "may not"} message parents`,
    });
  }
  revalidatePath("/admin");
}
