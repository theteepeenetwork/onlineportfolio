import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { jsonArray } from "@/lib/activities";
import { SharedLibrary, type SharedSummary } from "./SharedLibrary";

// Browsing Storyjar's own activities.
//
// Two queries, and the shape of them is the feature. The shared activities are
// read from their own table, which has no teacherId, so nothing here can leak
// into the teacher's own library. What the teacher has already added is read
// separately, from their own templates, and matched by provenance. The screen
// joins the two in memory rather than in a query, so "added" is a fact about
// this teacher and can never be a fact about the activity.
export default async function SharedLibraryPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;

  const [shared, mine, pendingCount] = await Promise.all([
    // published: true is in the WHERE. An unpublished activity is not hidden by
    // the rendering, it is never fetched.
    db.sharedActivity.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    // archived: false matters. Archiving is how a teacher takes something out of
    // their library, so an archived copy must not go on saying "Added" and
    // offering to open the thing they just put away. Without it the card is a
    // dead end: it claims they have it, links to an archived template, and gives
    // them no way to take it again.
    db.activityTemplate.findMany({
      where: { teacherId: user.teacher.id, sourceSharedActivityId: { not: null }, archived: false },
      select: { id: true, sourceSharedActivityId: true },
    }),
    db.journalItem.count({ where: { status: "PENDING", class: { teacherId: user.teacher.id } } }),
  ]);

  const addedByShared = new Map(mine.map((t) => [t.sourceSharedActivityId!, t.id]));

  const activities: SharedSummary[] = shared.map((a) => ({
    id: a.id,
    title: a.title,
    instructions: a.instructions ?? "",
    tags: jsonArray(a.tagsJson),
    thumb: jsonArray(a.templatePathsJson)[0] ?? null,
    ageMode: a.ageMode,
    addedTemplateId: addedByShared.get(a.id) ?? null,
  }));

  return (
    <>
      <TopBar links={teacherNav(pendingCount)} />
      <main className="sj" style={{ fontFamily: "var(--font-atkinson)", color: "var(--ink)" }}>
        <SharedLibrary activities={activities} />
      </main>
    </>
  );
}
