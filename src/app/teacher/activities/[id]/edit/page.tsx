import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { jsonArray } from "@/lib/activities";
import { readQuiz } from "@/lib/quiz";
import { readTemplateObjects } from "@/lib/canvasObjects";
import { ActivityBuilder } from "../../new/ActivityBuilder";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { id } = await params;

  // Scoped to this teacher — another school's template must 404, not load.
  const template = await db.activityTemplate.findFirst({
    where: { id, teacherId: user.teacher.id },
  });
  if (!template) notFound();

  // The runs this edit will land on. `updateTemplate` pushes the title, the
  // instructions, the pages, the quiz and the movable pieces onto every LIVE
  // run of this template and leaves CLOSED runs alone — so a teacher standing
  // here is either about to change what a class sees this minute, or is not,
  // and which one it is depends entirely on this query. The banner below states
  // whichever is true rather than hedging.
  const liveRuns = await db.assignment.findMany({
    where: { templateId: template.id, status: "LIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      class: { select: { name: true } },
      _count: { select: { responses: true } },
    },
  });

  const classNames = [...new Set(liveRuns.map((r) => r.class.name))];
  const handedIn = liveRuns.reduce((n, r) => n + r._count.responses, 0);

  return (
    <div className="w-full max-w-4xl">
      <Link href={`/teacher/activities/${template.id}`} className="text-sm text-muted hover:text-foreground">
        ← Back to activity
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold">Edit activity</h1>

      <LiveRunNotice classNames={classNames} handedIn={handedIn} />

      <ActivityBuilder
        teacherId={user.teacher.id}
        template={{
          id: template.id,
          title: template.title,
          instructions: template.instructions ?? "",
          tags: jsonArray(template.tagsJson),
          pages: jsonArray(template.templatePathsJson),
          quiz: readQuiz(template.quizJson),
          objects: readTemplateObjects(template.objectsJson).pages,
        }}
      />
    </div>
  );
}

// "Does editing this change the version the class is working on RIGHT NOW, or
// only future ones?" — the one thing a teacher said they needed to know before
// touching this screen. The true answer is: right now, for every part of the
// activity a child can see, and it is not a hedge because updateTemplate does
// exactly one thing to LIVE runs and does it unconditionally.
//
// The page used to answer it in a grey line under the heading. It is now a
// notice, it names the classes, and it says what is NOT changed as well as what
// is — a warning that only lists dangers gets read as "this is dangerous" and
// then ignored on the activity nobody has set yet.
function LiveRunNotice({ classNames, handedIn }: { classNames: string[]; handedIn: number }) {
  if (classNames.length === 0) {
    return (
      <div role="status" className="card mb-5 p-4">
        <p className="font-semibold">No class is working on this at the moment.</p>
        <p className="mt-1 text-sm text-muted">
          Your changes will apply the next time you set this activity for a class. Any
          activity you have already closed keeps the version it was set with.
        </p>
      </div>
    );
  }

  const who =
    classNames.length === 1
      ? `${classNames[0]} is working on this right now.`
      : `${classNames.length} classes are working on this right now: ${classNames.join(", ")}.`;

  return (
    <div
      role="status"
      className="mb-5 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950"
    >
      <p className="font-semibold">{who} Saving changes what they see.</p>
      <p className="mt-2 text-sm">
        The title, the instructions, the pages, the questions and the movable pieces are
        all replaced for them as soon as you save &mdash; including for a child who is
        part-way through. Change a question and children who answer after you save are
        answering a different question from the ones who answered before.
      </p>
      <p className="mt-2 text-sm">
        {handedIn === 1
          ? "The 1 piece of work already handed in is untouched, and so is anything you have already closed."
          : `Work already handed in is untouched (${handedIn} so far), and so is anything you have already closed.`}{" "}
        If you would rather leave this class alone, go back and use
        <strong> Duplicate</strong> to edit a copy instead.
      </p>
    </div>
  );
}
