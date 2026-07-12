import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountStateForTeacher, planLabel } from "@/lib/billing";
import { AdminConsole, type StaffRow, type SchoolClass, type AuditEntry } from "./AdminConsole";

// The whole-school / staff admin space. Only a school ADMIN may enter — everyone
// else is bounced back to their own teacher view. Nothing here exposes any
// child's work; that stays scoped to whoever teaches the class.
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (user.teacher.staffRole !== "ADMIN" || !user.teacher.schoolId) redirect("/teacher");

  const school = await db.school.findUnique({
    where: { id: user.teacher.schoolId },
    include: {
      staff: {
        orderBy: { createdAt: "asc" },
        include: {
          classes: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, _count: { select: { students: true } } },
          },
        },
      },
    },
  });
  if (!school) redirect("/teacher");

  // Plan label is derived from the school's subscription state (never a stored
  // free-text string). Reading it also settles a lapsed trial into FROZEN.
  const account = await accountStateForTeacher({ id: user.teacher.id, schoolId: user.teacher.schoolId });

  const staff: StaffRow[] = school.staff.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    status: s.status,
    isYou: s.id === user.teacher.id,
    classes: s.classes.map((c) => c.name),
  }));

  // School-wide classes (for the Classes tab and the "assign classes" picker).
  const classes: SchoolClass[] = school.staff.flatMap((s) =>
    s.classes.map((c) => ({ id: c.id, name: c.name, teacherId: s.id, teacherName: s.name, children: c._count.students })),
  );

  const childrenCount = classes.reduce((a, c) => a + c.children, 0);

  // Recent safeguarding-relevant actions for this school (accountability).
  const auditRows = await db.auditLog.findMany({
    where: { schoolId: school.id },
    orderBy: { at: "desc" },
    take: 100,
  });
  const audit: AuditEntry[] = auditRows.map((a) => ({
    id: a.id,
    atISO: a.at.toISOString(),
    actorName: a.actorName ?? a.actorType,
    action: a.action,
    detail: a.detail,
  }));

  return (
    <AdminConsole
      schoolName={school.name}
      plan={planLabel(account)}
      seatLimit={school.seatLimit}
      meId={user.teacher.id}
      staff={staff}
      classes={classes}
      childrenCount={childrenCount}
      audit={audit}
    />
  );
}
