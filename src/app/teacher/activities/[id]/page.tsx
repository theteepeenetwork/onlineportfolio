import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Icon } from "@/components/icons/Icon";
import { jsonArray, templateThumb, type RunSummary } from "@/lib/activities";
import { ClearMarkedDraft } from "@/components/ClearMarkedDraft";
import { canPublish } from "@/lib/libraryPublishing";
import { countRun, runHref } from "@/lib/runStatus";
import { TemplateActions } from "./TemplateActions";

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export default async function TemplateDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { id } = await params;
  const { run } = await searchParams;

  const template = await db.activityTemplate.findFirst({
    where: { id, teacherId: user.teacher.id },
    include: {
      assignments: {
        // ONLY RUNS IN CLASSES THIS TEACHER STILL TEACHES (F66). Without the
        // class filter this join walked assignments → class → students on the
        // strength of template authorship alone, so an author whose class had
        // been reassigned in September still read the new teacher's full
        // roster — every pupil's first name, avatar and per-child status. The
        // work itself was already out of reach (the pupil page is class-scoped),
        // which is what kept this a leak of names and progress rather than of
        // children's work.
        where: { class: { teacherId: user.teacher.id } },
        // Ids only. The names and each pupil's standing live on the run's own
        // page (/teacher/activities/runs/[runId]), which is scoped by the class
        // alone; this page carries counts.
        include: {
          class: { select: { id: true, name: true, students: { select: { id: true } } } },
          students: { select: { studentId: true } },
          responses: { select: { studentId: true, status: true } },
        },
      },
    },
  });
  if (!template) notFound();

  const classes = await db.class.findMany({
    // You cannot set an activity for a class that has stopped teaching.
    where: { teacherId: user.teacher.id, archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: { students: { orderBy: { name: "asc" }, select: { id: true, name: true, avatarColor: true } } },
  });

  // False at every real school, so the publish control is not drawn there at
  // all. The action re-asks the same question server-side; this only decides
  // what is rendered.
  const mayPublish = await canPublish(user.teacher.id);

  // LIVE runs first, then by newest.
  const runs = [...template.assignments].sort((a, b) => {
    if (a.status !== b.status) return a.status === "LIVE" ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const pages = jsonArray(template.templatePathsJson);
  // The picture of each page. `pages` is the background the editor is handed
  // back, so it carries neither the movable pieces nor the questions.
  const previews = jsonArray(template.previewPathsJson);
  const tags = jsonArray(template.tagsJson);

  const pastRuns: RunSummary[] = runs.map((a) => {
    const counts = countRun(a);
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

  // `?run=` still outlines one run — the one just set, when the assign sheet
  // lands here — but the per-pupil grid that used to hang off it has moved to
  // the run's own page, where the class's teacher can reach it whoever wrote
  // the activity.
  const highlighted = runs.find((a) => a.id === run)?.id ?? null;

  return (
    <>
      <ClearMarkedDraft />
      <div className="w-full max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          <Link href="/teacher/activities" className="hover:text-foreground">
            Library
          </Link>{" "}
          / Template
        </p>

        {/* Header */}
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {pages.length > 0 ? (
            <div className="flex gap-1.5">
              {(previews.length ? previews : pages).slice(0, 3).map((src) => (
                <Image key={src} src={src} alt="" width={120} height={84} unoptimized className="h-20 w-auto rounded-lg border border-border" />
              ))}
            </div>
          ) : (
            <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-border"><Icon name="add-file" size={26} decorative /></div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{template.title}</h1>
            {template.instructions && <p className="mt-1 text-muted">{template.instructions}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tg) => (
                <span key={tg} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                  {tg}
                </span>
              ))}
            </div>
          </div>
          <TemplateActions
            template={{
              id: template.id,
              title: template.title,
              thumb: templateThumb(template),
              librarySlug: template.librarySlug,
            }}
            classes={classes}
            pastRuns={pastRuns}
            canPublish={mayPublish}
          />
        </div>

        {/* Runs */}
        <h2 className="mt-8 mb-2 text-sm font-bold uppercase tracking-wide text-muted">Runs</h2>
        {runs.length === 0 ? (
          <p className="card p-6 text-center text-muted">Not assigned yet. Use Assign ▸ to run it with a class.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((a) => {
              const s = pastRuns.find((p) => p.id === a.id)!;
              const isSelected = highlighted === a.id;
              const pct = s.assigned ? Math.round((s.turnedIn / s.assigned) * 100) : 0;
              return (
                <Link
                  key={a.id}
                  href={runHref(a.id)}
                  className={`card flex flex-wrap items-center gap-3 p-3 ${isSelected ? "ring-2 ring-brand" : ""} ${a.status === "CLOSED" ? "opacity-70" : ""}`}
                >
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.status === "LIVE" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
                  >
                    {a.status === "LIVE" ? "● Live" : "Closed"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {a.class.name} · {a.wholeClass ? "whole class" : `${s.assigned} ${s.assigned === 1 ? "pupil" : "pupils"}`}
                    </p>
                    <p className="text-xs text-muted">Assigned {fmtDate(a.createdAt)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <div className="w-28">
                      <div className="h-2 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-0.5 text-right text-xs text-muted">
                        {s.turnedIn}/{s.assigned}
                        {s.waiting > 0 && <span className="ml-1 font-semibold text-amber-600">· {s.waiting} waiting</span>}
                      </p>
                    </div>
                    <span className={`${s.waiting > 0 ? "btn-brand" : "btn-ghost"} px-3 py-1.5 text-sm`}>Who has done it ▸</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

      </div>
    </>
  );
}
