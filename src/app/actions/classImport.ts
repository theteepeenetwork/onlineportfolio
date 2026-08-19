"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { uniqueClassCode } from "@/lib/classCode";
import { deriveChildNames } from "@/lib/childNames";
import { avatarColorAt } from "@/lib/avatarColors";
import { recordAudit } from "@/lib/audit";
import { requireWritableAccountForTeacher, FROZEN_TEACHER_MESSAGE } from "@/lib/billing";
import { normaliseAgeModeInput } from "@/lib/ageMode";

// ---------------------------------------------------------------------------
// Import a class from a pasted class list.
//
// The job this does: a teacher (or the office) has a register in SIMS, Arbor,
// Bromcom or a spreadsheet. They copy the column of names, paste it here with a
// class name, and the class exists with its children in it. One step, no CSV
// template to get wrong, no file upload — which also means no register file ever
// lands on our disk.
//
// Two callers, one action:
//   • a TEACHER importing their own class (ownerId omitted or their own id);
//   • a school ADMIN importing on behalf of a member of staff (ownerId set).
//
// Safeguarding notes (SAFEGUARDING.md):
//   • Rule 2 / data minimisation — surnames are dropped on the way in by
//     deriveChildNames. A pasted "Olivia Smith" is stored as "Olivia"; only when
//     two children share a first name is the shortest disambiguating surname
//     prefix kept. Nothing else from the paste is stored: no emails, no dates of
//     birth, no UPNs, no addresses. Anything after the name on a line is treated
//     as surname material and discarded by the same rule.
//   • Rule 5 — an admin may SET UP a class, and may not READ it afterwards. So
//     this action returns COUNTS ONLY, never the derived names, when the
//     importer is not the class's teacher. The admin console shows classes as
//     name / teacher / number of pupils, and nothing here changes that.
//   • Rule 4 / 8 — the target teacher must be in the admin's own school, checked
//     on the server. A staff id from another school resolves to nothing and the
//     import is refused; nothing about that school is echoed back.
//   • Rule 16 — the import is audited: who imported, for whom, which class, and
//     how many children. Never the children's names.
// ---------------------------------------------------------------------------

export type ImportResult = {
  error?: string;
  /** Set on success. Counts only — never the imported names. */
  imported?: {
    classId: string;
    className: string;
    /** The class code children type to sign in. Only returned to the class's own teacher. */
    classCode?: string;
    pupils: number;
    /** Lines that were pasted but collapsed as a repeat of a child already in the list. */
    duplicatesSkipped: number;
    /** True when the importer is not the teacher who will own the class. */
    onBehalf: boolean;
    ownerName: string;
  };
};

/** How many names one paste may carry. A UK primary class is ~30; the ceiling
 *  is generous enough for a whole year group pasted at once and low enough that
 *  a runaway paste can't create thousands of rows. */
const MAX_NAMES = 120;

export async function importClass(
  _prev: ImportResult | undefined,
  formData: FormData,
): Promise<ImportResult> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");

  const me = { id: user.teacher.id, schoolId: user.teacher.schoolId };
  const isAdmin = user.teacher.staffRole === "ADMIN";

  // --- Who will own the class? --------------------------------------------
  // Default: the person doing the import. An admin may nominate a colleague,
  // but only one who is in their own school (deny by default otherwise).
  const requestedOwnerId = String(formData.get("ownerId") ?? "").trim();
  let ownerId = me.id;
  let ownerName = user.teacher.displayName;
  const onBehalf = Boolean(requestedOwnerId) && requestedOwnerId !== me.id;

  if (onBehalf) {
    if (!isAdmin || !me.schoolId) {
      return { error: "Only a school admin can set up a class for someone else." };
    }
    const owner = await db.teacher.findFirst({
      where: { id: requestedOwnerId, schoolId: me.schoolId },
      select: { id: true, name: true, displayName: true },
    });
    if (!owner) return { error: "That member of staff isn't in your school." };
    ownerId = owner.id;
    ownerName = owner.displayName ?? owner.name;
  }

  // --- May the governing account still write? ------------------------------
  // The class belongs to the OWNER, so the owner's account is the one gated.
  // (In a school they share one subscription anyway; doing it this way keeps the
  // rule true for a teacher importing into their own free plan.)
  const gate = await requireWritableAccountForTeacher({ id: ownerId, schoolId: me.schoolId });
  if (!gate.ok) return { error: FROZEN_TEACHER_MESSAGE };

  // --- The class itself ----------------------------------------------------
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Please give the class a name." };
  if (name.length > 60) return { error: "That class name is a little long — 60 characters or fewer, please." };

  const yearGroupRaw = String(formData.get("yearGroup") ?? "").trim();
  const yearGroup = yearGroupRaw ? yearGroupRaw.slice(0, 30) : null;

  // Nothing is pre-selected on the form, so "skipped" is a real answer and
  // stores NULL, which resolves to the youngest, most protective register.
  const ageMode = normaliseAgeModeInput(formData.get("ageMode"));

  const clash = await db.class.findFirst({
    where: { teacherId: ownerId, name },
    select: { id: true },
  });
  if (clash) {
    return {
      error: onBehalf
        ? `${ownerName} already has a class called "${name}". Give this one a different name.`
        : `You already have a class called "${name}". Give this one a different name.`,
    };
  }

  // --- The pasted list -----------------------------------------------------
  // One name per line is what we ask for, but people paste commas, tabs and
  // semicolons too (a spreadsheet column comes across tab-separated), so we
  // accept all of them. Blank lines are ignored.
  const raw = String(formData.get("names") ?? "");
  const rawEntries = raw
    .split(/[\n\r,;\t]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (rawEntries.length > MAX_NAMES) {
    return { error: `That's ${rawEntries.length} names — please import ${MAX_NAMES} or fewer at a time.` };
  }

  // Surnames off, first names only, with the shortest disambiguating prefix
  // where two children share a first name.
  const names = deriveChildNames(rawEntries);
  const duplicatesSkipped = Math.max(0, rawEntries.length - names.length);

  // --- Write ---------------------------------------------------------------
  const classCode = await uniqueClassCode();
  const created = await db.class.create({
    data: { name, yearGroup, ageMode, classCode, teacherId: ownerId },
    select: { id: true, name: true, classCode: true },
  });

  if (names.length > 0) {
    await db.student.createMany({
      data: names.map((n, i) => ({ name: n, classId: created.id, avatarColor: avatarColorAt(i) })),
    });
  }

  await recordAudit({
    action: "CLASS_IMPORTED",
    actorType: onBehalf ? "ADMIN" : "TEACHER",
    actorId: me.id,
    actorName: user.teacher.displayName,
    schoolId: me.schoolId,
    subjectType: "CLASS",
    subjectId: created.id,
    // Counts and the class name only — never a child's name.
    detail: onBehalf
      ? `Imported "${created.name}" for ${ownerName} with ${names.length} ${names.length === 1 ? "pupil" : "pupils"}`
      : `Imported "${created.name}" with ${names.length} ${names.length === 1 ? "pupil" : "pupils"}`,
  });

  revalidatePath("/teacher/class");
  revalidatePath("/teacher");
  revalidatePath("/admin");

  return {
    imported: {
      classId: created.id,
      className: created.name,
      // The class code is the children's way in. It goes back only to the
      // teacher who will actually use it, never to an admin setting up a class
      // they don't teach.
      classCode: onBehalf ? undefined : created.classCode,
      pupils: names.length,
      duplicatesSkipped,
      onBehalf,
      ownerName,
    },
  };
}
