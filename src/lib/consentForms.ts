import "server-only";
import { db } from "@/lib/db";
import { tally, type ConsentAnswer, type ConsentTally } from "@/lib/consent";

// ===========================================================================
// Reading permission slips, for each of the three people who may see one.
//
// One module, so the three screens cannot disagree about who may see what. The
// answers themselves live in src/lib/consent.ts, which is pure and shared with
// the browser; this is the part that touches the database and is `server-only`.
//
// WHO SEES WHAT, and each is scoped in its own query rather than by a caller
// remembering to:
//
//   • A PARENT sees the forms sent to their own child's class, and their own
//     household's answer. Never another child's, never another household's, and
//     never a tally — a family is not shown how the rest of the class voted.
//   • A CLASS TEACHER sees the register for a class they hold: which children
//     have answered, which way, and who has not. That is the list they take on
//     the trip.
//   • The ADMIN who sent it sees the same register for the classes it went to.
//     Rule 5 says an admin never sees a child's WORK; a permission slip is an
//     administrative record of a decision an ADULT made, of the same kind as
//     the paper register of who is going, and the rule 21 amendment says so in
//     an "administrative records" clause rather than leaving it to be inferred.
// ===========================================================================

export type FamilyForm = {
  id: string;
  title: string;
  formBody: string;
  asksPackedLunch: boolean;
  closesOn: string | null;
  answer: ConsentAnswer | null;
  packedLunch: boolean;
};

const ukDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Forms waiting for, or already answered by, one household about one child. */
export async function formsForParent(parentId: string, studentId: string): Promise<FamilyForm[]> {
  // The child must be linked to THIS parent. Resolved here rather than trusted
  // from the caller: every read in this module carries its own scope (rule 4).
  const child = await db.student.findFirst({
    where: { id: studentId, parents: { some: { id: parentId } } },
    select: { id: true, classId: true },
  });
  if (!child) return [];

  const forms = await db.consentForm.findMany({
    where: { classes: { some: { classId: child.classId } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      formBody: true,
      asksPackedLunch: true,
      closesAt: true,
      // ONLY THIS CHILD'S ANSWER. A parent is never shown another child's, and a
      // `where` on the relation is what makes that structural rather than a
      // filter somebody could forget in the component.
      responses: { where: { studentId: child.id }, select: { answer: true, packedLunch: true } },
    },
  });

  return forms.map((f) => ({
    id: f.id,
    title: f.title,
    formBody: f.formBody,
    asksPackedLunch: f.asksPackedLunch,
    // Formatted on the server, as every other date the family space shows is,
    // so a server render and a browser hydration cannot disagree about how en-GB
    // punctuates one (the failure documented in officeHours.ts).
    closesOn: f.closesAt ? ukDate(f.closesAt) : null,
    answer: (f.responses[0]?.answer as ConsentAnswer | undefined) ?? null,
    packedLunch: f.responses[0]?.packedLunch ?? false,
  }));
}

export type RegisterRow = { childId: string; childName: string; answer: ConsentAnswer | null; packedLunch: boolean };
export type FormRegister = {
  id: string;
  title: string;
  closesOn: string | null;
  asksPackedLunch: boolean;
  sentBy: string;
  className: string;
  rows: RegisterRow[];
  counts: ConsentTally;
};

/**
 * The registers for the classes a teacher holds — the list they take on the
 * trip: who said yes, who said no, who has not answered.
 */
export async function registersForTeacher(teacherId: string): Promise<FormRegister[]> {
  const links = await db.consentFormClass.findMany({
    // Scoped by the class this teacher HOLDS. Not by school, and not by an id
    // off a form: a colleague's class is not theirs to read.
    where: { class: { teacherId, archivedAt: null } },
    orderBy: { form: { createdAt: "desc" } },
    select: {
      class: { select: { id: true, name: true, students: { select: { id: true, name: true }, orderBy: { name: "asc" } } } },
      form: {
        select: {
          id: true, title: true, closesAt: true, asksPackedLunch: true, createdByName: true,
          responses: { select: { studentId: true, answer: true, packedLunch: true } },
        },
      },
    },
  });

  return links.map((link) => {
    const byChild = new Map(link.form.responses.map((r) => [r.studentId, r]));
    const rows: RegisterRow[] = link.class.students.map((s) => ({
      childId: s.id,
      childName: s.name,
      answer: (byChild.get(s.id)?.answer as ConsentAnswer | undefined) ?? null,
      packedLunch: byChild.get(s.id)?.packedLunch ?? false,
    }));
    // Counted over THIS class's children only, from the rows above — a form sent
    // to three classes must not show one teacher the whole school's numbers.
    const mine = rows.filter((r) => r.answer !== null).map((r) => ({ answer: r.answer as string, packedLunch: r.packedLunch }));
    return {
      id: link.form.id,
      title: link.form.title,
      closesOn: link.form.closesAt ? ukDate(link.form.closesAt) : null,
      asksPackedLunch: link.form.asksPackedLunch,
      sentBy: link.form.createdByName,
      className: link.class.name,
      rows,
      counts: tally(mine, link.class.students.length),
    };
  });
}

export type AdminFormSummary = {
  id: string;
  title: string;
  closesOn: string | null;
  sentBy: string;
  sentOn: string;
  asksPackedLunch: boolean;
  classes: Array<{ name: string; counts: ConsentTally }>;
};

/**
 * What the school sees: one line per class per form — answered, given, not
 * given, still waiting, and the packed-lunch headcount if it asked for one.
 *
 * COUNTS AND CLASS NAMES, NEVER A CHILD. The office needs to know how many slips
 * are outstanding in 4B and whether the caterer needs eight lunches; which
 * child said what is the class teacher's register, because that is the person
 * who takes them out of the building. A school that needs a name asks the
 * teacher, exactly as it did with paper.
 */
export async function formsForSchool(schoolId: string): Promise<AdminFormSummary[]> {
  const forms = await db.consentForm.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true, title: true, closesAt: true, createdByName: true, createdAt: true, asksPackedLunch: true,
      classes: { select: { class: { select: { id: true, name: true, _count: { select: { students: true } } } } } },
      responses: { select: { studentId: true, answer: true, packedLunch: true, student: { select: { classId: true } } } },
    },
  });

  return forms.map((f) => ({
    id: f.id,
    title: f.title,
    closesOn: f.closesAt ? ukDate(f.closesAt) : null,
    sentBy: f.createdByName,
    sentOn: ukDate(f.createdAt),
    asksPackedLunch: f.asksPackedLunch,
    classes: f.classes.map((c) => {
      const mine = f.responses.filter((r) => r.student.classId === c.class.id);
      return { name: c.class.name, counts: tally(mine, c.class._count.students) };
    }),
  }));
}
