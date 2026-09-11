import Link from "next/link";
import type { RunCounts } from "@/lib/runStatus";
import { runHref } from "@/lib/runStatus";

export type LiveRun = {
  id: string;
  title: string;
  className: string;
  wholeClass: boolean;
  dueAtISO: string | null;
  counts: RunCounts;
};

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// What is set right now, by class, each one a door to who has and hasn't done
// it. The library below is organised by ACTIVITY; a teacher standing in front of
// a class asks the question by CLASS ("who in Sunflower still hasn't done the
// apples?"), and until this list the answer was three clicks deep under the
// template, if they knew to look there.
//
// `id="live-now"` is an address, not decoration: the dashboard's "activities
// live now" card and /teacher/activities/runs both land here.
export function LiveNow({ runs }: { runs: LiveRun[] }) {
  return (
    <section id="live-now" aria-labelledby="live-now-heading" style={{ marginBottom: 22, scrollMarginTop: 16 }}>
      <h2 id="live-now-heading" style={{ margin: "0 0 4px", font: "600 20px var(--font-fredoka)" }}>
        Live now
      </h2>
      <p style={{ margin: "0 0 12px", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        {runs.length === 0
          ? "Nothing is set for a class at the moment. Set an activity and it will show here, with who has done it."
          : "Open one to see who has done it and who hasn't."}
      </p>
      {runs.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {runs.map((r) => (
            <li key={r.id}>
              <Link
                href={runHref(r.id)}
                className="sj-card"
                style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", textDecoration: "none", color: "var(--ink)", minHeight: 44, height: "100%", boxSizing: "border-box" }}
              >
                <span style={{ font: "600 17px/1.25 var(--font-fredoka)" }}>{r.title}</span>
                <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                  {r.className} · {r.wholeClass ? "whole class" : `${r.counts.assigned} ${r.counts.assigned === 1 ? "pupil" : "pupils"}`}
                  {r.dueAtISO ? ` · due ${fmtDay(r.dueAtISO)}` : ""}
                </span>
                <RunBar counts={r.counts} />
                <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--ink-soft)" }}>
                  {r.counts.assigned === 0 ? (
                    "No pupils on this one"
                  ) : (
                    <>
                      <strong>{r.counts.inJar}</strong> in their jar
                      {r.counts.waiting > 0 && <> · <strong>{r.counts.waiting}</strong> waiting for you</>}
                      {" "}· of {r.counts.assigned}
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Teal for work in the jar, honey for work waiting on the teacher — the same two
// colours the calendar uses for the same two facts.
export function RunBar({ counts }: { counts: Pick<RunCounts, "assigned" | "inJar" | "waiting"> }) {
  const pctJar = counts.assigned ? Math.min(100, (counts.inJar / counts.assigned) * 100) : 0;
  const pctWait = counts.assigned ? Math.min(100 - pctJar, (counts.waiting / counts.assigned) * 100) : 0;
  return (
    <span aria-hidden style={{ display: "flex", height: 8, borderRadius: 999, background: "var(--calm-border)", overflow: "hidden" }}>
      <span style={{ width: `${pctJar}%`, background: "#37796f" }} />
      <span style={{ width: `${pctWait}%`, background: "var(--honey)" }} />
    </span>
  );
}
