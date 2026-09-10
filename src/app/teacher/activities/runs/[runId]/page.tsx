import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import {
  RUN_STATUS_LABEL,
  pupilRunStatus,
  runRosterIds,
  summariseRun,
  type PupilRunStatus,
} from "@/lib/runStatus";
import { RunBar } from "../../LiveNow";

// Who has and hasn't done one activity, for one class. The question a teacher
// actually asks ("who still hasn't done the apples?") is a CLASS question, and
// the only per-pupil view that existed was a grid under the template, three
// clicks deep and reachable only by whoever wrote the activity.
//
// SCOPED BY THE CLASS, NEVER BY THE TEMPLATE (F66). The run is found by its id
// AND a class this teacher holds today, so:
//   - a teacher at another school gets a 404 for any id they send (rule 8);
//   - a template's author whose class was handed to a colleague in September
//     gets a 404 too, because authorship of the activity is not a reason to see
//     the class it was set to;
//   - the class's NEW teacher sees it, whoever wrote the activity.
// The pupils are the class's CURRENT register (see `runRosterIds`), so a pupil
// who has moved on is never named here.
//
// WHAT IT DOES NOT SAY: "not started". Drafts are private even from the teacher
// (rule 4), so all this page can know about a pupil with no hand-in is that
// nothing has been handed in yet, and that is what it says.

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);

const STATUS_STYLE: Record<PupilRunStatus, { color: string; background: string }> = {
  IN_JAR: { color: "#1B6B57", background: "#D1F0E4" },
  WAITING: { color: "var(--honey-ink)", background: "var(--honey-tint)" },
  SENT_BACK: { color: "var(--ink-soft)", background: "var(--kraft-tag)" },
  NOT_HANDED_IN: { color: "var(--sj-muted)", background: "var(--cream)" },
};

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const teacherId = user.teacher.id;
  const { runId } = await params;

  const run = await db.assignment.findFirst({
    where: { id: runId, class: { teacherId } },
    select: {
      id: true,
      title: true,
      instructions: true,
      status: true,
      wholeClass: true,
      createdAt: true,
      dueDate: true,
      template: { select: { id: true, teacherId: true } },
      class: {
        select: {
          id: true,
          name: true,
          archivedAt: true,
          students: { orderBy: { name: "asc" }, select: { id: true, name: true, avatarColor: true } },
        },
      },
      students: { select: { studentId: true } },
      // The newest first, so the WAITING row links to the latest hand-in.
      responses: { orderBy: { createdAt: "desc" }, select: { id: true, studentId: true, status: true } },
    },
  });
  if (!run) notFound();

  const rosterIds = new Set(
    runRosterIds({
      wholeClass: run.wholeClass,
      classStudentIds: run.class.students.map((s) => s.id),
      chosenStudentIds: run.students.map((s) => s.studentId),
    }),
  );
  const roster = run.class.students.filter((s) => rosterIds.has(s.id));
  const counts = summariseRun([...rosterIds], run.responses);

  const responsesFor = (studentId: string) => run.responses.filter((r) => r.studentId === studentId);
  const rows = roster.map((p) => {
    const mine = responsesFor(p.id);
    const status = pupilRunStatus(mine);
    const waitingId = status === "WAITING" ? mine.find((r) => r.status === "PENDING")?.id ?? null : null;
    return { ...p, status, waitingId };
  });

  // The activity itself is its author's. After a handover the class's new
  // teacher can see this run but not the template, so the link is drawn only
  // for the author, who is the only person it would not 404 for.
  const ownsTemplate = run.template.teacherId === teacherId;
  const live = run.status === "LIVE";

  const band: { status: PupilRunStatus; n: number }[] = [
    { status: "IN_JAR", n: counts.inJar },
    { status: "WAITING", n: counts.waiting },
    { status: "SENT_BACK", n: counts.sentBack },
    { status: "NOT_HANDED_IN", n: counts.notHandedIn },
  ];

  return (
    <div style={{ maxWidth: 960 }}>
      <p style={{ margin: 0, font: "700 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        <Link href="/teacher/activities#live-now" style={{ color: "var(--ink-soft)", textDecoration: "none" }}>
          ← Activities
        </Link>
      </p>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", margin: "12px 0 16px" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ margin: 0, font: "600 30px/1.2 var(--font-fredoka)" }}>{run.title}</h1>
          <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                font: "700 12px var(--font-atkinson)",
                borderRadius: 999,
                padding: "3px 10px",
                background: live ? "#D1F0E4" : "#EDEDED",
                color: live ? "#1B6B57" : "#5B6472",
              }}
            >
              {live ? "Live" : "Closed"}
            </span>
            <span>
              {run.class.name} · {run.wholeClass ? "whole class" : `${roster.length} ${roster.length === 1 ? "pupil" : "pupils"} chosen`} · set {fmtDate(run.createdAt)}
              {run.dueDate ? ` · due ${fmtDate(run.dueDate)}` : ""}
            </span>
          </p>
          {run.instructions && (
            <p style={{ margin: "8px 0 0", font: "400 15px/1.5 var(--font-atkinson)", color: "var(--ink-soft)" }}>{run.instructions}</p>
          )}
        </div>
        {ownsTemplate && (
          <Link
            href={`/teacher/activities/${run.template.id}?run=${run.id}`}
            style={{ display: "inline-flex", alignItems: "center", minHeight: 44, boxSizing: "border-box", font: "700 14px var(--font-atkinson)", color: "var(--ink)", textDecoration: "none", border: "2px solid var(--ink)", borderRadius: 999, padding: "9px 18px", background: "var(--cream)" }}
          >
            Open the activity
          </Link>
        )}
      </div>

      {run.class.archivedAt && (
        <p role="note" style={{ margin: "0 0 14px", font: "400 14px var(--font-atkinson)", color: "var(--ink-soft)", background: "var(--kraft-tag)", borderRadius: 12, padding: "10px 14px" }}>
          {run.class.name} has been archived, so this is last year&apos;s record.
        </p>
      )}

      {/* The counts, as one band — the same four words the rows below use. */}
      <div style={{ background: "var(--kraft-tag)", border: "3px solid var(--ink)", borderRadius: 16, padding: "14px 18px", marginBottom: 18 }}>
        <p style={{ margin: "0 0 10px", font: "700 16px var(--font-atkinson)" }}>
          {counts.assigned === 0
            ? "No pupils on this one."
            : `${counts.turnedIn} of ${counts.assigned} ${counts.assigned === 1 ? "pupil has" : "pupils have"} handed something in`}
        </p>
        {counts.assigned > 0 && <RunBar counts={counts} />}
        <ul aria-label="Counts" style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", gap: 16, flexWrap: "wrap" }}>
          {band.map((b) => (
            <li key={b.status} data-count={b.status} style={{ font: "400 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              <strong style={{ color: "var(--ink)" }}>{b.n}</strong> {RUN_STATUS_LABEL[b.status].toLowerCase()}
            </li>
          ))}
        </ul>
      </div>

      <h2 style={{ margin: "0 0 4px", font: "600 20px var(--font-fredoka)" }}>Pupils</h2>
      <p style={{ margin: "0 0 12px", font: "400 14px/1.5 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: "46em" }}>
        Work a pupil has started and not handed in stays private to them, so this can only show what has been handed in.
      </p>

      {rows.length === 0 ? (
        <p className="sj-card" style={{ margin: 0, padding: "28px 24px", textAlign: "center", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          No pupils on this one.
        </p>
      ) : (
        <ul aria-label={`Pupils set ${run.title}`} style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
          {rows.map((p) => (
            <li
              key={p.id}
              data-pupil={p.name}
              data-status={p.status}
              style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--paper)", border: "2px solid var(--calm-border)", borderRadius: 14, padding: "10px 12px", minHeight: 64, boxSizing: "border-box" }}
            >
              <Avatar name={p.name} color={p.avatarColor} size={40} />
              <span style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <Link href={`/teacher/students/${p.id}`} style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </Link>
                <span style={{ alignSelf: "flex-start", font: "700 12px var(--font-atkinson)", borderRadius: 999, padding: "2px 9px", ...STATUS_STYLE[p.status] }}>
                  {RUN_STATUS_LABEL[p.status]}
                </span>
              </span>
              {p.waitingId && (
                <Link
                  href={`/teacher/queue/${p.waitingId}`}
                  aria-label={`Look at ${p.name}'s work`}
                  style={{ display: "inline-flex", alignItems: "center", minHeight: 44, boxSizing: "border-box", font: "700 14px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", textDecoration: "none", borderRadius: 999, padding: "8px 16px", boxShadow: "0 3px 0 var(--jam-deep)", whiteSpace: "nowrap" }}
                >
                  Look at it
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
