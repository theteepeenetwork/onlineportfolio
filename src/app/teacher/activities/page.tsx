import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { jsonArray } from "@/lib/activities";
import { ActivityLibrary, type TemplateSummary, type NeedsAttention } from "./ActivityLibrary";

export default async function ActivityLibraryPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [templates, classes, pendingCount] = await Promise.all([
    db.activityTemplate.findMany({
      where: { teacherId: user.teacher.id, archived: false },
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
    db.journalItem.count({ where: { status: "PENDING", class: { teacherId: user.teacher.id } } }),
  ]);

  const needsAttention: NeedsAttention[] = [];
  const summaries: TemplateSummary[] = templates.map((t) => {
    const liveClassNames = [
      ...new Set(t.assignments.filter((a) => a.status === "LIVE").map((a) => a.class.name)),
    ];
    let waiting = 0;
    const pastRuns = t.assignments.map((a) => {
      const assigned = a.wholeClass ? a.class._count.students : a._count.students;
      const turnedIn = new Set(a.responses.map((r) => r.studentId)).size;
      const wait = a.responses.filter((r) => r.status === "PENDING").length;
      if (a.status === "LIVE") {
        waiting += wait;
        if (wait > 0) {
          needsAttention.push({ templateId: t.id, title: t.title, className: a.class.name, waiting: wait });
        }
      }
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
    const closedCount = t.assignments.filter((a) => a.status === "CLOSED").length;
    return {
      id: t.id,
      title: t.title,
      instructions: t.instructions ?? "",
      tags: jsonArray(t.tagsJson),
      thumb: jsonArray(t.templatePathsJson)[0] ?? null,
      liveClassNames,
      runCount: closedCount,
      waiting,
      neverRun: t.assignments.length === 0,
      pastRuns,
    };
  });

  const allTags = [...new Set(summaries.flatMap((s) => s.tags))].sort();

  return (
    <>
      <TopBar
        title="Activity library"
        subtitle="Reusable templates you can assign to any class, again and again."
        links={teacherNav(pendingCount)}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        <ActivityLibrary
          templates={summaries}
          classes={classes}
          needsAttention={needsAttention}
          allTags={allTags}
        />
      </main>
    </>
  );
}
