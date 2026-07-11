import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { jsonArray } from "@/lib/activities";
import { ActivityLibrary, type TemplateSummary, type FolderInfo } from "./ActivityLibrary";

export default async function ActivityLibraryPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [templates, classes, folders, pendingCount] = await Promise.all([
    db.activityTemplate.findMany({
      where: { teacherId: user.teacher.id },
      orderBy: { createdAt: "desc" },
      include: {
        assignments: {
          orderBy: { createdAt: "desc" },
          include: {
            class: { select: { name: true, _count: { select: { students: true } } } },
            _count: { select: { students: true } },
            responses: { select: { studentId: true, status: true } },
          },
        },
      },
    }),
    db.class.findMany({
      where: { teacherId: user.teacher.id },
      orderBy: { createdAt: "asc" },
      include: { students: { orderBy: { name: "asc" }, select: { id: true, name: true, avatarColor: true } } },
    }),
    db.folder.findMany({ where: { teacherId: user.teacher.id }, orderBy: { createdAt: "asc" } }),
    db.journalItem.count({ where: { status: "PENDING", class: { teacherId: user.teacher.id } } }),
  ]);

  const summaries: TemplateSummary[] = templates.map((t) => {
    const liveClassNames = [
      ...new Set(t.assignments.filter((a) => a.status === "LIVE").map((a) => a.class.name)),
    ];
    const sentClasses = new Set(t.assignments.map((a) => a.class.name)).size;
    let waiting = 0;
    const pastRuns = t.assignments.map((a) => {
      const assigned = a.wholeClass ? a.class._count.students : a._count.students;
      const turnedIn = new Set(a.responses.map((r) => r.studentId)).size;
      const wait = a.responses.filter((r) => r.status === "PENDING").length;
      if (a.status === "LIVE") waiting += wait;
      return {
        id: a.id,
        className: a.class.name,
        wholeClass: a.wholeClass,
        status: a.status as "LIVE" | "CLOSED",
        createdAt: a.createdAt.toISOString(),
        assigned,
        turnedIn,
        waiting: wait,
      };
    });
    return {
      id: t.id,
      title: t.title,
      instructions: t.instructions ?? "",
      tags: jsonArray(t.tagsJson),
      thumb: jsonArray(t.templatePathsJson)[0] ?? null,
      archived: t.archived,
      folderId: t.folderId,
      liveClassNames,
      sentClasses,
      waiting,
      neverRun: t.assignments.length === 0,
      pastRuns,
    };
  });

  const folderInfos: FolderInfo[] = folders.map((f) => ({ id: f.id, name: f.name, color: f.color }));

  return (
    <>
      <TopBar links={teacherNav(pendingCount)} />
      <main className="sj" style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)" }}>
        <ActivityLibrary templates={summaries} classes={classes} folders={folderInfos} />
      </main>
    </>
  );
}
