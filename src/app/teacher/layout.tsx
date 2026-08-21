import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountStateForTeacher } from "@/lib/billing";
import { FrozenBanner } from "@/components/FrozenBanner";
import { TeacherShell, type ShellClass } from "@/components/teacher/TeacherShell";
import { classTint } from "@/lib/classTints";

// Two initials for the identity-bar avatar, from the teacher's own name.
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}

// Guard: everything under /teacher requires a signed-in teacher.
//
// It is also where the persistent shell lives — the identity bar and the left
// rail are the only navigation in the teacher area, so they are rendered once
// here rather than by each page.
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login/teacher");
  if (user.role !== "TEACHER") redirect("/student");

  const teacherId = user.teacher.id;

  // Everything the shell shows is this teacher's own — the queries are scoped
  // by `teacherId`, so the rail and the badge can only ever show classes this
  // teacher teaches (SAFEGUARDING rule 4). This runs on EVERY navigation in the
  // teacher area, so it is kept to what the rail actually draws: no pupils, no
  // activities. The search box fetches its own index on first focus
  // (src/app/actions/teacherSearch.ts).
  const [account, profile, classes, waitingByClass] = await Promise.all([
    // Surface a read-only banner when the account is frozen. This also settles a
    // lapsed trial into FROZEN on first load. Server-side actions enforce the
    // real block regardless of whether this banner renders.
    accountStateForTeacher({ id: teacherId, schoolId: user.teacher.schoolId }),
    db.teacher.findUnique({
      where: { id: teacherId },
      select: { schoolName: true, school: { select: { name: true } } },
    }),
    db.class.findMany({
      where: { teacherId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    db.journalItem.groupBy({
      by: ["classId"],
      where: { status: "PENDING", class: { teacherId } },
      _count: { _all: true },
    }),
  ]);

  const waiting = new Map(waitingByClass.map((row) => [row.classId, row._count._all]));
  const pending = [...waiting.values()].reduce((a, b) => a + b, 0);

  const shellClasses: ShellClass[] = classes.map((c, i) => ({
    id: c.id,
    name: c.name,
    dot: classTint(i).jarFill,
    waiting: waiting.get(c.id) ?? 0,
  }));

  return (
    <TeacherShell
      teacher={{ name: user.teacher.displayName, initials: initialsOf(user.teacher.name) }}
      schoolName={profile?.school?.name ?? profile?.schoolName ?? null}
      isAdmin={user.teacher.staffRole === "ADMIN"}
      classes={shellClasses}
      pending={pending}
      banner={account.status === "FROZEN" ? <FrozenBanner /> : null}
    >
      {children}
    </TeacherShell>
  );
}
