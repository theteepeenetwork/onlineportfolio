import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { teacherNav } from "@/lib/teacherNav";
import { jsonArray, type RunSummary } from "@/lib/activities";
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
        include: {
          class: {
            select: { id: true, name: true, students: { select: { id: true, name: true, avatarColor: true }, orderBy: { name: "asc" } } },
          },
          students: { include: { student: { select: { id: true, name: true, avatarColor: true } } } },
          responses: { select: { id: true, studentId: true, status: true } },
        },
      },
    },
  });
  if (!template) notFound();

  const [classes, pendingCount] = await Promise.all([
    db.class.findMany({
      where: { teacherId: user.teacher.id },
      orderBy: { createdAt: "asc" },
      include: { students: { orderBy: { name: "asc" }, select: { id: true, name: true, avatarColor: true } } },
    }),
    db.journalItem.count({ where: { status: "PENDING", class: { teacherId: user.teacher.id } } }),
  ]);

  // LIVE runs first, then by newest.
  const runs = [...template.assignments].sort((a, b) => {
    if (a.status !== b.status) return a.status === "LIVE" ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const pages = jsonArray(template.templatePathsJson);
  const tags = jsonArray(template.tagsJson);

  const pastRuns: RunSummary[] = runs.map((a) => ({
    id: a.id,
    className: a.class.name,
    wholeClass: a.wholeClass,
    status: a.status as "LIVE" | "CLOSED",
    createdAt: a.createdAt.toISOString(),
    assigned: a.wholeClass ? a.class.students.length : a.students.length,
    turnedIn: new Set(a.responses.map((r) => r.studentId)).size,
    waiting: a.responses.filter((r) => r.status === "PENDING").length,
  }));

  const selected = runs.find((a) => a.id === run) ?? runs.find((a) => a.status === "LIVE") ?? runs[0];

  // The children assigned to the selected run + each one's response status.
  const roster = selected
    ? selected.wholeClass
      ? selected.class.students
      : selected.students.map((s) => s.student)
    : [];
  const responseByStudent = new Map(selected?.responses.map((r) => [r.studentId, r.status]) ?? []);
  const selectedWaiting = selected ? pastRuns.find((p) => p.id === selected.id)?.waiting ?? 0 : 0;

  return (
    <>
      <TopBar title="" links={teacherNav(pendingCount)} />
      <main className="mx-auto w-full max-w-4xl flex-1 p-4">
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
              {pages.slice(0, 3).map((src) => (
                <Image key={src} src={src} alt="" width={120} height={84} unoptimized className="h-20 w-auto rounded-lg border border-border" />
              ))}
            </div>
          ) : (
            <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-border text-2xl">📝</div>
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
            template={{ id: template.id, title: template.title, thumb: pages[0] ?? null }}
            classes={classes}
            pastRuns={pastRuns}
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
              const isSelected = selected?.id === a.id;
              const pct = s.assigned ? Math.round((s.turnedIn / s.assigned) * 100) : 0;
              return (
                <Link
                  key={a.id}
                  href={`/teacher/activities/${template.id}?run=${a.id}`}
                  className={`card flex flex-wrap items-center gap-3 p-3 ${isSelected ? "ring-2 ring-brand" : ""} ${a.status === "CLOSED" ? "opacity-70" : ""}`}
                >
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${a.status === "LIVE" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
                  >
                    {a.status === "LIVE" ? "● Live" : "Closed"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {a.class.name} · {a.wholeClass ? "whole class" : `${s.assigned} ${s.assigned === 1 ? "child" : "children"}`}
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
                    {s.waiting > 0 ? (
                      <span className="btn-brand px-3 py-1.5 text-sm">Review ▸</span>
                    ) : (
                      <span className="btn-ghost px-3 py-1.5 text-sm">View</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Response grid for the selected run */}
        {selected && (
          <>
            <h2 className="mt-8 mb-2 text-sm font-bold uppercase tracking-wide text-muted">
              Responses — {selected.class.name}
              {selectedWaiting > 0 && (
                <Link href="/teacher/queue" className="ml-2 font-semibold text-brand normal-case">
                  Review waiting ▸
                </Link>
              )}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {roster.map((child) => {
                const st = responseByStudent.get(child.id);
                const done = st === "APPROVED";
                const waiting = st === "PENDING" || st === "RETURNED";
                const href = waiting ? "/teacher/queue" : `/teacher/students/${child.id}`;
                return (
                  <Link
                    key={child.id}
                    href={href}
                    className={`card flex flex-col items-center gap-1 p-3 text-center ${!st ? "opacity-60" : ""} ${waiting ? "border-amber-300 bg-amber-50" : ""}`}
                  >
                    <Avatar name={child.name} color={child.avatarColor} size={36} />
                    <span className="truncate text-sm font-semibold">{child.name}</span>
                    <span className={`text-xs font-semibold ${done ? "text-emerald-700" : waiting ? "text-amber-700" : "text-muted"}`}>
                      {done ? "✓ done" : waiting ? "● waiting" : "not yet"}
                    </span>
                  </Link>
                );
              })}
              {roster.length === 0 && <p className="text-sm text-muted">No children on this run.</p>}
            </div>
          </>
        )}
      </main>
    </>
  );
}
