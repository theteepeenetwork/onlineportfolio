import "server-only";
import { db } from "@/lib/db";
import { eveningLabel, slotLabel } from "@/lib/meetings";

// ===========================================================================
// Reading a parents' evening, for each of the three people who may see one.
//
// One module, so the three screens cannot disagree about who may see what. The
// geometry and the labels live in src/lib/meetings.ts, which is pure and shared
// with the browser; this is the part that touches the database.
//
// WHO SEES WHAT, each scoped in its own query rather than by a caller
// remembering to — the shape `consentForms.ts` uses, and for the same reasons:
//
//   • A PARENT sees the evenings their own child's class is holding, which
//     appointments are free, and their own booking. A taken slot shows as taken
//     and NEVER who took it: a parents' evening list with names on it tells one
//     family when another family is in the building.
//   • A CLASS TEACHER sees their own list for the night: the time, the child,
//     and which families have not booked. That is the sheet they work from.
//   • The ADMIN who set it up sees, per class, how many appointments there are
//     and how many are taken — the same "counts, not children" line as a
//     permission slip, and the same clause of rule 5 permits it.
// ===========================================================================

export type FamilySlot = {
  id: string;
  at: string;
  taken: boolean;
  /** True when this is the slot THIS family holds. */
  mine: boolean;
};

export type FamilyEvening = {
  id: string;
  title: string;
  on: string;
  teacherName: string;
  className: string;
  opensOn: string | null;
  /** False until `opensAt` has passed; the slots are shown but not bookable. */
  open: boolean;
  slots: FamilySlot[];
  /** The time this family already holds, if they hold one. */
  myTime: string | null;
};

/** The evenings one household may book for one child. */
export async function eveningsForParent(parentId: string, studentId: string, now: Date = new Date()): Promise<FamilyEvening[]> {
  // The child must be linked to THIS parent. Resolved here rather than trusted
  // from the caller: every read in this module carries its own scope (rule 4).
  const child = await db.student.findFirst({
    where: { id: studentId, parents: { some: { id: parentId } } },
    select: { id: true, classId: true },
  });
  if (!child) return [];

  const events = await db.meetingEvent.findMany({
    where: { slots: { some: { classId: child.classId } } },
    orderBy: { eventDate: "asc" },
    select: {
      id: true,
      title: true,
      eventDate: true,
      opensAt: true,
      // ONLY THIS CHILD'S CLASS. A `where` on the relation is what makes that
      // structural rather than a filter somebody could forget in the component.
      slots: {
        where: { classId: child.classId },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          studentId: true,
          teacher: { select: { name: true, displayName: true } },
          class: { select: { name: true } },
        },
      },
    },
  });

  return events
    .filter((e) => e.slots.length > 0)
    .map((e) => {
      const first = e.slots[0];
      const mineSlot = e.slots.find((s) => s.studentId === child.id) ?? null;
      return {
        id: e.id,
        title: e.title,
        on: eveningLabel(e.eventDate),
        teacherName: first.teacher.displayName ?? first.teacher.name,
        className: first.class.name,
        opensOn: e.opensAt ? eveningLabel(e.opensAt.toISOString().slice(0, 10)) : null,
        open: !e.opensAt || e.opensAt <= now,
        slots: e.slots.map((s) => ({
          id: s.id,
          at: slotLabel(s.startsAt),
          // WHETHER it is taken, never BY WHOM. `studentId` is read here and
          // reduced to a boolean before it leaves the server; nothing that
          // reaches the browser carries another family's child.
          taken: s.studentId !== null,
          mine: s.studentId === child.id,
        })),
        myTime: mineSlot ? slotLabel(mineSlot.startsAt) : null,
      };
    });
}

export type TeacherSlotRow = { at: string; childName: string | null };
export type TeacherEvening = {
  id: string;
  title: string;
  on: string;
  className: string;
  rows: TeacherSlotRow[];
  booked: number;
  free: number;
  /** Children in the class whose family has not booked anything. */
  notBooked: string[];
};

/** A teacher's own list for the night, per class they hold. */
export async function eveningsForTeacher(teacherId: string): Promise<TeacherEvening[]> {
  const slots = await db.meetingSlot.findMany({
    // Scoped by the teacher the appointment BELONGS to. Not by school, and not
    // by an id off an event: a colleague's evening is not theirs to read.
    where: { teacherId, class: { archivedAt: null } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      eventId: true,
      student: { select: { name: true } },
      class: { select: { id: true, name: true, students: { select: { id: true, name: true }, orderBy: { name: "asc" } } } },
      event: { select: { id: true, title: true, eventDate: true } },
    },
  });

  // Grouped by (event, class): one teacher can hold two classes, and a school
  // can run the same evening for both.
  const groups = new Map<string, TeacherEvening & { bookedIds: Set<string>; classStudents: { id: string; name: string }[] }>();
  for (const s of slots) {
    const key = `${s.eventId}:${s.class.id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        id: s.event.id,
        title: s.event.title,
        on: eveningLabel(s.event.eventDate),
        className: s.class.name,
        rows: [],
        booked: 0,
        free: 0,
        notBooked: [],
        bookedIds: new Set<string>(),
        classStudents: s.class.students,
      };
      groups.set(key, g);
    }
    g.rows.push({ at: slotLabel(s.startsAt), childName: s.student?.name ?? null });
    if (s.student) g.booked += 1;
    else g.free += 1;
  }
  // Whose family has not booked. Collected from the slot rows rather than a
  // second query, so the two numbers on the screen cannot disagree.
  for (const s of slots) {
    if (!s.student) continue;
    const g = groups.get(`${s.eventId}:${s.class.id}`);
    const match = g?.classStudents.find((c) => c.name === s.student?.name);
    if (g && match) g.bookedIds.add(match.id);
  }
  return [...groups.values()].map((g) => ({
    id: g.id,
    title: g.title,
    on: g.on,
    className: g.className,
    rows: g.rows,
    booked: g.booked,
    free: g.free,
    notBooked: g.classStudents.filter((c) => !g.bookedIds.has(c.id)).map((c) => c.name),
  }));
}

export type AdminEveningClass = { className: string; teacherName: string; slots: number; booked: number };
export type AdminEvening = {
  id: string;
  title: string;
  on: string;
  opensOn: string | null;
  createdBy: string;
  classes: AdminEveningClass[];
};

/**
 * What the school sees: one line per class per evening — how many appointments
 * there are and how many are taken.
 *
 * COUNTS AND CLASS NAMES, NEVER A CHILD, for the same reason a permission slip's
 * register is the class teacher's: the office needs to know whether 4B is full
 * and whether to send another letter home, and who is coming at 6:20 is the
 * business of the teacher who will be sitting there. SAFEGUARDING rule 5's
 * administrative-records clause is what permits the counts and what stops them
 * becoming a list.
 */
export async function eveningsForSchool(schoolId: string): Promise<AdminEvening[]> {
  const events = await db.meetingEvent.findMany({
    where: { schoolId },
    orderBy: { eventDate: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      eventDate: true,
      opensAt: true,
      createdByName: true,
      slots: {
        select: {
          studentId: true,
          class: { select: { id: true, name: true } },
          teacher: { select: { name: true, displayName: true } },
        },
      },
    },
  });

  return events.map((e) => {
    const byClass = new Map<string, AdminEveningClass>();
    for (const s of e.slots) {
      let row = byClass.get(s.class.id);
      if (!row) {
        row = { className: s.class.name, teacherName: s.teacher.displayName ?? s.teacher.name, slots: 0, booked: 0 };
        byClass.set(s.class.id, row);
      }
      row.slots += 1;
      // Reduced to a count on the server. The id itself never leaves this
      // function, which is the difference between a count and a list.
      if (s.studentId !== null) row.booked += 1;
    }
    return {
      id: e.id,
      title: e.title,
      on: eveningLabel(e.eventDate),
      opensOn: e.opensAt ? eveningLabel(e.opensAt.toISOString().slice(0, 10)) : null,
      createdBy: e.createdByName,
      classes: [...byClass.values()].sort((a, b) => a.className.localeCompare(b.className)),
    };
  });
}
