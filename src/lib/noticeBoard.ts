import "server-only";
import { db } from "@/lib/db";
import { senderLabel } from "@/lib/notices";

// ===========================================================================
// Reading the notice board, for each of the three people who may see it.
//
// One module, so the three screens cannot disagree about who may see what — the
// `consentForms.ts` shape. Each reader is scoped in its own query rather than
// by a caller remembering to (rule 4).
//
//   • A PARENT sees the notices addressed to their household: whole-school
//     notices for every school their children are in, and class notices for
//     every class their children are in. ONCE PER HOUSEHOLD, not once per
//     child — a notice is to the family, and a parent with two children in the
//     school should read "closed on Friday" one time.
//   • A member of STAFF sees what they sent (including what they took down),
//     plus every whole-school notice, because staff should know what families
//     have been told.
//   • The ADMIN sees everything the school has sent. Nothing in a notice is
//     about a child, so rule 5 has nothing to say here — which is itself worth
//     stating, because it is the only staff screen in the messaging area where
//     that is true.
//
// A notice is NEVER a route to a child. No reader here selects a student, and
// the ops blindness fixture beside the model proves the relation rule still
// refuses one that tries.
// ===========================================================================

export type FamilyNoticeView = {
  id: string;
  title: string;
  noticeBody: string;
  /** "Whole school", or the class name(s) it was sent to that this family is in. */
  scope: string;
  from: string;
  /** "Tuesday 9 September", formatted on the server. */
  sentOn: string;
};

const ukDate = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** The notice board for one household. */
export async function noticesForParent(parentId: string): Promise<FamilyNoticeView[]> {
  // The children linked to THIS parent, and through them the classes and
  // schools that may address this household. The link is the scope.
  const children = await db.student.findMany({
    where: { parents: { some: { id: parentId } } },
    select: { classId: true, class: { select: { schoolId: true, archivedAt: true } } },
  });
  const classIds = children.filter((c) => !c.class.archivedAt).map((c) => c.classId);
  const schoolIds = [...new Set(children.map((c) => c.class.schoolId).filter((s): s is string => Boolean(s)))];
  if (classIds.length === 0 && schoolIds.length === 0) return [];

  const rows = await db.notice.findMany({
    where: {
      retractedAt: null,
      OR: [
        { audience: "SCHOOL", schoolId: { in: schoolIds } },
        { audience: "CLASSES", classes: { some: { classId: { in: classIds } } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      noticeBody: true,
      audience: true,
      sentByName: true,
      sentByRole: true,
      createdAt: true,
      // ONLY the classes this household is in. A notice sent to Robins and
      // Wrens shows a Robins family "Robins", not the other class's name.
      classes: { where: { classId: { in: classIds } }, select: { class: { select: { name: true } } } },
    },
  });

  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    noticeBody: n.noticeBody,
    scope: n.audience === "SCHOOL" ? "Whole school" : n.classes.map((c) => c.class.name).join(", "),
    from: senderLabel(n.sentByRole, n.sentByName),
    sentOn: ukDate(n.createdAt),
  }));
}

export type StaffNoticeView = {
  id: string;
  title: string;
  noticeBody: string;
  scope: string;
  from: string;
  sentOn: string;
  /** May THIS viewer take it down: the sender, or an admin. */
  canRetract: boolean;
  retracted: boolean;
  retractedByName: string | null;
};

const staffSelect = {
  id: true,
  title: true,
  noticeBody: true,
  audience: true,
  schoolId: true,
  sentByTeacherId: true,
  sentByName: true,
  sentByRole: true,
  createdAt: true,
  retractedAt: true,
  retractedByName: true,
  classes: { select: { class: { select: { name: true } } } },
} as const;

type StaffRow = {
  id: string;
  title: string;
  noticeBody: string;
  audience: string;
  sentByTeacherId: string;
  sentByName: string;
  sentByRole: string;
  createdAt: Date;
  retractedAt: Date | null;
  retractedByName: string | null;
  classes: Array<{ class: { name: string } }>;
};

function toStaffView(n: StaffRow, viewerId: string, viewerIsAdmin: boolean): StaffNoticeView {
  return {
    id: n.id,
    title: n.title,
    noticeBody: n.noticeBody,
    scope: n.audience === "SCHOOL" ? "Whole school" : n.classes.map((c) => c.class.name).join(", "),
    from: senderLabel(n.sentByRole, n.sentByName),
    sentOn: ukDate(n.createdAt),
    canRetract: viewerIsAdmin || n.sentByTeacherId === viewerId,
    retracted: n.retractedAt !== null,
    retractedByName: n.retractedByName,
  };
}

/** What one member of staff sent, plus every whole-school notice. */
export async function noticesForTeacher(teacherId: string): Promise<StaffNoticeView[]> {
  const me = await db.teacher.findUnique({ where: { id: teacherId }, select: { schoolId: true, role: true } });
  if (!me?.schoolId) return [];
  const rows = await db.notice.findMany({
    where: {
      schoolId: me.schoolId,
      OR: [
        { sentByTeacherId: teacherId },
        // Whole-school notices are shown to every member of staff, taken-down
        // ones excluded: what a family was told, not the office's history.
        { audience: "SCHOOL", retractedAt: null },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: staffSelect,
  });
  return rows.map((n) => toStaffView(n, teacherId, me.role === "ADMIN"));
}

/** Everything the school has sent, newest first. */
export async function noticesForSchool(schoolId: string, viewerId: string): Promise<StaffNoticeView[]> {
  const rows = await db.notice.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: staffSelect,
  });
  return rows.map((n) => toStaffView(n, viewerId, true));
}
