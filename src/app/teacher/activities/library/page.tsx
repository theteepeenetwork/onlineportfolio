import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonArray } from "@/lib/activities";
import { canPublish } from "@/lib/libraryPublishing";
import { PublishedLibrary, type PublishedSummary } from "./PublishedLibrary";

// What StoryJar has published, for the people who publish it.
//
// WHO SEES THIS SCREEN
//
// Only a teacher whose school has `canPublishToLibrary` — StoryJar Academy, and
// nowhere else. Every other teacher gets a 404, not a message: a school that
// cannot publish should not learn that publishing exists, which is the same
// posture the operator console takes towards its own screens.
//
// WHY IT LISTS EVERY LIBRARY ACTIVITY AND NOT JUST THIS TEACHER'S
//
// Because it is StoryJar's library, not one member of staff's. Sixteen Academy
// accounts share the job, and an activity that had to be withdrawn by whoever
// happened to publish it is an activity that cannot be withdrawn on a Friday.
// The teacher-owned half of the join is the template each row came from, which
// is what "Edit" needs, and that is scoped to the teacher who has it.

export default async function PublishedLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{
    published?: string;
    visible?: string;
    withdrawn?: string;
    saved?: string;
    problem?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  if (!(await canPublish(user.teacher.id))) notFound();

  const flags = await searchParams;

  const [published, sources] = await Promise.all([
    db.sharedActivity.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    // The templates behind them, so a row can offer a way back to the canvas.
    // Scoped to this teacher: a colleague's template is not this teacher's to
    // open, even when the activity it produced is shared.
    db.activityTemplate.findMany({
      where: { teacherId: user.teacher.id, librarySlug: { not: null } },
      select: { id: true, librarySlug: true },
    }),
  ]);

  const templateBySlug = new Map(sources.map((t) => [t.librarySlug!, t.id]));

  const activities: PublishedSummary[] = published.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    instructions: a.instructions ?? "",
    tags: jsonArray(a.tagsJson),
    thumb: jsonArray(a.templatePathsJson)[0] ?? null,
    ageMode: a.ageMode,
    published: a.published,
    sortOrder: a.sortOrder,
    templateId: templateBySlug.get(a.slug) ?? null,
  }));

  const notice = flags.problem
    ? "That did not work. Nothing was changed."
    : flags.published
      ? "Added to the library. It is not visible to teachers until you make it visible."
      : flags.visible
        ? "It is now visible to every teacher."
        : flags.withdrawn
          ? "Withdrawn. Teachers who already added it keep their own copy."
          : flags.saved
            ? "Saved."
            : null;

  return <PublishedLibrary activities={activities} notice={notice} problem={Boolean(flags.problem)} />;
}
