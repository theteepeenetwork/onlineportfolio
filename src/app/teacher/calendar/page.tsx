import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { CLASS_TINTS } from "@/lib/classTints";
import { CalendarView, type CalendarRun, type CalendarClass } from "./CalendarView";

// A month calendar of every activity run, plotted on its due day (or, with no
// due date, its assigned day), with completion at a glance. Reuses the same
// assigned / turned-in / approved / waiting formulas as the activity screens.
export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const teacherId = user.teacher.id;
  const [assignments, classes, pendingCount] = await Promise.all([
    db.assignment.findMany({
      // Reached via the template's owner; do NOT filter template.archived — a
      // run that happened still belongs on the calendar.
      where: { template: { teacherId } },
      orderBy: { createdAt: "desc" },
      include: {
        class: { select: { id: true, name: true, _count: { select: { students: true } } } },
        _count: { select: { students: true } }, // AssignmentStudent count (chosen-children runs)
        responses: { select: { studentId: true, status: true } },
        template: { select: { id: true } },
      },
    }),
    db.class.findMany({ where: { teacherId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    db.journalItem.count({ where: { status: "PENDING", class: { teacherId } } }),
  ]);

  // Same class ordering as the My-classes screen → same tint per class.
  const tintIndexById = new Map(classes.map((c, i) => [c.id, i % CLASS_TINTS.length]));

  const runs: CalendarRun[] = assignments.map((a) => {
    const assigned = a.wholeClass ? a.class._count.students : a._count.students;
    const turnedIn = new Set(a.responses.map((r) => r.studentId)).size;
    const completed = new Set(
      a.responses.filter((r) => r.status === "APPROVED").map((r) => r.studentId),
    ).size;
    const waiting = a.responses.filter((r) => r.status === "PENDING" || r.status === "RETURNED").length;
    return {
      id: a.id,
      templateId: a.template.id,
      title: a.title,
      className: a.class.name,
      classId: a.classId,
      classIndex: tintIndexById.get(a.classId) ?? 0,
      wholeClass: a.wholeClass,
      status: a.status as "LIVE" | "CLOSED",
      assignedAtISO: a.createdAt.toISOString(),
      dueAtISO: a.dueDate ? a.dueDate.toISOString() : null,
      assigned,
      turnedIn,
      completed,
      waiting,
    };
  });

  const calClasses: CalendarClass[] = classes.map((c, i) => ({ id: c.id, name: c.name, classIndex: i % CLASS_TINTS.length }));

  return (
    <>
      <TopBar links={teacherNav(pendingCount)} />
      <main className="sj" style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)" }}>
        <CalendarView runs={runs} classes={calClasses} todayISO={new Date().toISOString()} />
      </main>
    </>
  );
}
