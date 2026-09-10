import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonArray, templateThumb } from "@/lib/activities";
import { canPublish } from "@/lib/libraryPublishing";
import { countRun } from "@/lib/runStatus";
import { ActivityLibrary, type TemplateSummary, type FolderInfo } from "./ActivityLibrary";
import type { LiveRun } from "./LiveNow";

// What every run query on this page selects, so that `countRun` can say who is
// set it and where each of them stands.
const RUN_COUNTING = {
  class: { select: { id: true, name: true, students: { select: { id: true } } } },
  students: { select: { studentId: true } },
  responses: { select: { studentId: true, status: true } },
} as const;

export default async function ActivityLibraryPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const teacherId = user.teacher.id;
  const [templates, classes, folders, live] = await Promise.all([
    db.activityTemplate.findMany({
      where: { teacherId },
      orderBy: { createdAt: "desc" },
      include: {
        assignments: {
          // ONLY RUNS IN CLASSES THIS TEACHER STILL HOLDS — the eighth F66
          // site, found on 10 September 2026. Every other template→class join
          // was given the class as a second scope on 29 August; this one was
          // missed, so a template's author whose class had been handed to a
          // colleague still saw that class's work counted on the card ("1
          // waiting to approve") and the class named, with its turned-in
          // figure, under "Already ran" in the assign sheet. Pupils' names
          // never reached this page, which is what kept it to counts.
          // Covered by class-handover.spec.ts, which fails with this line gone.
          where: { class: { teacherId } },
          orderBy: { createdAt: "desc" },
          include: RUN_COUNTING,
        },
      },
    }),
    db.class.findMany({
      // You cannot set an activity for a class that has stopped teaching.
      where: { teacherId, archivedAt: null },
      orderBy: { createdAt: "asc" },
      include: { students: { orderBy: { name: "asc" }, select: { id: true, name: true, avatarColor: true } } },
    }),
    db.folder.findMany({ where: { teacherId }, orderBy: { createdAt: "asc" } }),
    // "Live now": every run that is live in a class this teacher holds today,
    // whoever wrote the activity. Scoped by the CLASS alone, because after a
    // handover the class's new teacher is the one who needs to know who has
    // done it, and the template's author is not (F66). Archived classes are
    // last year's and carry nothing that is live for this year's children.
    db.assignment.findMany({
      where: { status: "LIVE", class: { teacherId, archivedAt: null } },
      orderBy: { createdAt: "desc" },
      include: RUN_COUNTING,
    }),
  ]);

  const summaries: TemplateSummary[] = templates.map((t) => {
    const liveClassNames = [
      ...new Set(t.assignments.filter((a) => a.status === "LIVE").map((a) => a.class.name)),
    ];
    const sentClasses = new Set(t.assignments.map((a) => a.class.name)).size;
    let waiting = 0;
    const pastRuns = t.assignments.map((a) => {
      const counts = countRun(a);
      if (a.status === "LIVE") waiting += counts.waiting;
      return {
        id: a.id,
        className: a.class.name,
        wholeClass: a.wholeClass,
        status: a.status as "LIVE" | "CLOSED",
        createdAt: a.createdAt.toISOString(),
        assigned: counts.assigned,
        turnedIn: counts.turnedIn,
        waiting: counts.waiting,
      };
    });
    return {
      id: t.id,
      title: t.title,
      instructions: t.instructions ?? "",
      tags: jsonArray(t.tagsJson),
      thumb: templateThumb(t),
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

  const liveRuns: LiveRun[] = live.map((a) => ({
    id: a.id,
    title: a.title,
    className: a.class.name,
    wholeClass: a.wholeClass,
    dueAtISO: a.dueDate ? a.dueDate.toISOString() : null,
    counts: countRun(a),
  }));

  // False at every real school. The Publishing link is drawn only for StoryJar
  // staff signed in at the Academy; the screen behind it 404s to anybody else.
  const mayPublish = await canPublish(teacherId);

  return (
    <ActivityLibrary
      templates={summaries}
      liveRuns={liveRuns}
      classes={classes}
      folders={folderInfos}
      canPublish={mayPublish}
    />
  );
}
