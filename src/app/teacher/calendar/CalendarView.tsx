"use client";

import { useEffect, useMemo, useState } from "react";
import { classTint } from "@/lib/classTints";

export type CalendarRun = {
  id: string;
  templateId: string;
  title: string;
  className: string;
  classId: string;
  classIndex: number;
  wholeClass: boolean;
  status: "LIVE" | "CLOSED";
  assignedAtISO: string;
  dueAtISO: string | null;
  assigned: number;
  turnedIn: number;
  completed: number;
  waiting: number;
};

export type CalendarClass = { id: string; name: string; classIndex: number };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 86_400_000;
const MAX_PILLS = 3;

// ── local-date helpers (mirror src/lib/relativeDay.ts: compare by calendar day) ──
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
// The day a run sits on: its due day if it has one, else its assigned day.
const runDate = (r: CalendarRun) => new Date(r.dueAtISO ?? r.assignedAtISO);
const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtLongDay = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

type RunFlags = { overdue: boolean; dueSoon: boolean; complete: boolean };
function runFlags(r: CalendarRun, today: Date): RunFlags {
  const complete = r.assigned > 0 && r.completed === r.assigned;
  let overdue = false;
  let dueSoon = false;
  if (r.dueAtISO && r.status === "LIVE" && r.completed < r.assigned) {
    const due = startOfDay(new Date(r.dueAtISO)).getTime();
    const t0 = startOfDay(today).getTime();
    if (due < t0) overdue = true;
    else if (due <= t0 + 3 * DAY_MS) dueSoon = true;
  }
  return { overdue, dueSoon, complete };
}

export function CalendarView({
  runs,
  classes,
  todayISO,
}: {
  runs: CalendarRun[];
  classes: CalendarClass[];
  todayISO: string;
}) {
  const today = useMemo(() => new Date(todayISO), [todayISO]);
  const [year, setYear] = useState(() => today.getFullYear());
  const [month0, setMonth0] = useState(() => today.getMonth());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "agenda">("grid");

  // Narrow screens default to the agenda (no 2-D grid navigation); the toggle
  // stays available. Computed after mount to avoid an SSR/CSR mismatch.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches) {
      setView("agenda");
    }
  }, []);

  const shown = useMemo(
    () => (classFilter.size === 0 ? runs : runs.filter((r) => classFilter.has(r.classId))),
    [runs, classFilter],
  );

  // Bucket runs by their local calendar day.
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarRun[]>();
    for (const r of shown) {
      const k = dayKey(runDate(r));
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    for (const list of m.values()) {
      list.sort((a, b) => runDate(a).getTime() - runDate(b).getTime());
    }
    return m;
  }, [shown]);

  // The visible month's grid cells (Monday-first full weeks).
  const cells = useMemo(() => {
    const first = new Date(year, month0, 1);
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();
    const leadPad = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
    const total = Math.ceil((leadPad + daysInMonth) / 7) * 7;
    const todayKey = dayKey(today);
    return Array.from({ length: total }, (_, i) => {
      const date = new Date(year, month0, 1 - leadPad + i);
      const key = dayKey(date);
      return {
        date,
        key,
        inMonth: date.getMonth() === month0,
        isToday: key === todayKey,
        runs: byDay.get(key) ?? [],
      };
    });
  }, [year, month0, byDay, today]);

  // Runs in the visible month (for the summary + agenda).
  const monthRuns = useMemo(
    () => shown.filter((r) => { const d = runDate(r); return d.getFullYear() === year && d.getMonth() === month0; }),
    [shown, year, month0],
  );

  const summary = useMemo(() => {
    let assigned = 0, completed = 0, waiting = 0, live = 0, overdue = 0;
    for (const r of monthRuns) {
      if (r.assigned > 0) { assigned += r.assigned; completed += r.completed; }
      waiting += r.waiting;
      if (r.status === "LIVE") live += 1;
      if (runFlags(r, today).overdue) overdue += 1;
    }
    return { runs: monthRuns.length, pct: assigned ? Math.round((completed / assigned) * 100) : 0, live, waiting, overdue };
  }, [monthRuns, today]);

  const monthLabel = new Date(year, month0, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const step = (delta: number) => {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
    setSelectedKey(null);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth0(today.getMonth()); setSelectedKey(dayKey(today)); };

  const toggleClass = (id: string) =>
    setClassFilter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedRuns = selectedKey ? byDay.get(selectedKey) ?? [] : [];
  const selectedDate = selectedKey ? cells.find((c) => c.key === selectedKey)?.date ?? null : null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", padding: "28px 24px 80px", boxSizing: "border-box" }}>
      {/* header: title + view toggle + nav */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, font: "600 32px var(--font-fredoka)" }}>Calendar</h1>
          <p style={{ margin: "5px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>When you set each activity, and how many children have done it.</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 2, background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 999, padding: 2 }}>
            {(["grid", "agenda"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                style={{ font: "700 14px var(--font-atkinson)", cursor: "pointer", border: "none", borderRadius: 999, padding: "7px 16px", background: view === v ? "var(--ink)" : "transparent", color: view === v ? "var(--paper)" : "var(--ink-soft)" }}>
                {v === "grid" ? "Month" : "Agenda"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => step(-1)} aria-label="Previous month" style={navBtn}>‹</button>
            <span style={{ font: "600 18px var(--font-fredoka)", minWidth: 168, textAlign: "center" }}>{monthLabel}</span>
            <button onClick={() => step(1)} aria-label="Next month" style={navBtn}>›</button>
            <button onClick={goToday} style={{ ...navBtn, width: "auto", padding: "0 14px", font: "700 14px var(--font-atkinson)" }}>Today</button>
          </div>
        </div>
      </div>

      {/* summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Stat value={`${summary.runs}`} label="Runs this month" color="var(--ink)" />
        <Stat value={`${summary.pct}%`} label="Completion" color="#37796f" />
        <Stat value={`${summary.live}`} label="Live now" color="var(--ink)" />
        <Stat value={`${summary.waiting}`} label="Waiting to approve" color="var(--honey-ink)" />
        <Stat value={`${summary.overdue}`} label="Overdue" color={summary.overdue > 0 ? "var(--jam)" : "var(--sj-muted)"} />
      </div>

      {/* class filter chips */}
      {classes.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button onClick={() => setClassFilter(new Set())} aria-pressed={classFilter.size === 0}
            style={{ ...chip, background: classFilter.size === 0 ? "var(--ink)" : "var(--cream)", color: classFilter.size === 0 ? "var(--paper)" : "var(--ink-soft)", borderColor: classFilter.size === 0 ? "var(--ink)" : "var(--calm-border)" }}>
            All classes
          </button>
          {classes.map((c) => {
            const on = classFilter.has(c.id);
            const t = classTint(c.classIndex);
            return (
              <button key={c.id} onClick={() => toggleClass(c.id)} aria-pressed={on}
                style={{ ...chip, background: on ? t.color : "var(--cream)", borderColor: "var(--ink)", color: "var(--ink)" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: t.jarFill, border: "1.5px solid var(--ink)" }} />
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {view === "grid" ? (
        <MonthGrid cells={cells} today={today} onSelect={setSelectedKey} selectedKey={selectedKey} />
      ) : (
        <Agenda runs={monthRuns} today={today} emptyLabel={`No activities in ${monthLabel}.`} />
      )}

      {selectedDate && (
        <DayPanel date={selectedDate} runs={selectedRuns} today={today} onClose={() => setSelectedKey(null)} />
      )}
    </div>
  );
}

// ── month grid ──
function MonthGrid({
  cells,
  today,
  onSelect,
  selectedKey,
}: {
  cells: { date: Date; key: string; inMonth: boolean; isToday: boolean; runs: CalendarRun[] }[];
  today: Date;
  onSelect: (k: string) => void;
  selectedKey: string | null;
}) {
  return (
    <div className="sj-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "2px solid var(--calm-border)" }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ padding: "10px 8px", font: "700 12px var(--font-atkinson)", color: "var(--sj-muted)", textAlign: "center", letterSpacing: "0.04em", textTransform: "uppercase" }}>{w}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((c) => {
          const overdue = c.runs.filter((r) => runFlags(r, today).overdue).length;
          const label = `${fmtLongDay(c.date)}${c.runs.length ? `, ${c.runs.length} activit${c.runs.length === 1 ? "y" : "ies"}` : ", no activities"}${overdue ? `, ${overdue} overdue` : ""}`;
          return (
            <button
              key={c.key}
              onClick={() => onSelect(c.key)}
              aria-label={label}
              style={{
                textAlign: "left", cursor: "pointer", border: "none", borderRight: "1px solid #F0EADD", borderBottom: "1px solid #F0EADD",
                background: c.isToday ? "#FCF7EC" : c.inMonth ? "var(--cream)" : "#FBF8F1",
                minHeight: 104, padding: "6px 7px", display: "flex", flexDirection: "column", gap: 4,
                opacity: c.inMonth ? 1 : 0.5,
                outline: selectedKey === c.key ? "2px solid var(--glass)" : "none", outlineOffset: -2,
              }}
            >
              <span style={{ display: "flex", alignItems: "center" }}>
                <span style={{ font: "700 13px var(--font-atkinson)", color: c.isToday ? "var(--paper)" : c.inMonth ? "var(--ink)" : "var(--sj-muted)", background: c.isToday ? "var(--jam)" : "transparent", borderRadius: 999, padding: c.isToday ? "1px 7px" : 0 }}>{c.date.getDate()}</span>
              </span>
              {c.runs.slice(0, MAX_PILLS).map((r) => <DayPill key={r.id} run={r} today={today} />)}
              {c.runs.length > MAX_PILLS && (
                <span style={{ font: "700 11px var(--font-atkinson)", color: "var(--sj-muted)" }}>+{c.runs.length - MAX_PILLS} more</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayPill({ run, today }: { run: CalendarRun; today: Date }) {
  const t = classTint(run.classIndex);
  const f = runFlags(run, today);
  const dot = f.overdue ? "var(--jam)" : f.dueSoon ? "var(--honey)" : f.complete ? "#37796f" : "transparent";
  return (
    <span title={`${run.title} · ${run.className} · ${run.completed}/${run.assigned} in the jar`}
      style={{ display: "flex", alignItems: "center", gap: 5, background: t.color, border: "1px solid rgba(34,48,74,0.15)", borderRadius: 6, padding: "2px 6px", font: "700 11px var(--font-atkinson)", color: "var(--ink)", minWidth: 0, opacity: run.status === "CLOSED" ? 0.65 : 1 }}>
      {dot !== "transparent" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, flexShrink: 0 }} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.title}</span>
      <span style={{ marginLeft: "auto", color: "var(--ink-soft)", flexShrink: 0 }}>{run.completed}/{run.assigned}</span>
    </span>
  );
}

// ── day detail panel (overlay, backdrop-close) ──
function DayPanel({ date, runs, today, onClose }: { date: Date; runs: CalendarRun[]; today: Date; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(34,48,74,0.3)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "6vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} className="sj-card" style={{ width: "100%", maxWidth: 560, padding: "22px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, font: "600 24px var(--font-fredoka)" }}>{fmtLongDay(date)}</h2>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", ...navBtn }}>✕</button>
        </div>
        {runs.length === 0 ? (
          <p style={{ margin: "16px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>Nothing assigned or due on this day.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {runs.map((r) => <RunRow key={r.id} run={r} today={today} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── agenda view ──
function Agenda({ runs, today, emptyLabel }: { runs: CalendarRun[]; today: Date; emptyLabel: string }) {
  const groups = useMemo(() => {
    const m = new Map<string, { date: Date; runs: CalendarRun[] }>();
    for (const r of runs) {
      const d = runDate(r);
      const k = dayKey(d);
      if (!m.has(k)) m.set(k, { date: d, runs: [] });
      m.get(k)!.runs.push(r);
    }
    return [...m.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [runs]);

  if (groups.length === 0) {
    return <div className="sj-card" style={{ padding: "40px 28px", textAlign: "center", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>{emptyLabel}</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {groups.map((g) => (
        <div key={dayKey(g.date)}>
          <h3 style={{ margin: "0 0 10px", font: "600 18px var(--font-fredoka)" }}>{fmtLongDay(g.date)}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {g.runs.map((r) => <RunRow key={r.id} run={r} today={today} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── a run row (shared by the day panel + agenda) ──
function RunRow({ run, today }: { run: CalendarRun; today: Date }) {
  const t = classTint(run.classIndex);
  const f = runFlags(run, today);
  const assigned = new Date(run.assignedAtISO);
  const due = run.dueAtISO ? new Date(run.dueAtISO) : null;
  return (
    <a href={`/teacher/activities/${run.templateId}?run=${run.id}`}
      className="sj-card" style={{ display: "block", padding: "14px 16px", textDecoration: "none", color: "var(--ink)", opacity: run.status === "CLOSED" ? 0.8 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ font: "700 12px var(--font-atkinson)", background: run.status === "LIVE" ? "#D1F0E4" : "#EDEDED", color: run.status === "LIVE" ? "#1B6B57" : "#5B6472", borderRadius: 999, padding: "3px 10px" }}>{run.status === "LIVE" ? "● Live" : "Closed"}</span>
        <span style={{ font: "700 12px var(--font-atkinson)", background: t.color, border: "1.5px solid var(--ink)", borderRadius: 999, padding: "3px 10px" }}>{run.className}</span>
        {f.overdue && <span style={tag("var(--jam)", "var(--error-tint)")}>Overdue</span>}
        {f.dueSoon && <span style={tag("var(--honey-ink)", "var(--honey-tint)")}>Due soon</span>}
        {f.complete && <span style={tag("#1B6B57", "#D1F0E4")}>✓ All in</span>}
      </div>
      <p style={{ margin: "10px 0 0", font: "600 18px var(--font-fredoka)" }}>{run.title}</p>
      <p style={{ margin: "2px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        {run.wholeClass ? "Whole class" : `${run.assigned} ${run.assigned === 1 ? "child" : "children"}`} · Assigned {fmtDay(assigned)}{due ? ` · Due ${fmtDay(due)}` : ""}
      </p>
      <div style={{ marginTop: 10 }}>
        <ProgressBar completed={run.completed} waiting={run.waiting} assigned={run.assigned} />
        <p style={{ margin: "5px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--ink-soft)" }}>
          {run.assigned === 0 ? "No children assigned" : (
            <>
              <strong>{run.completed}</strong> in the jar
              {run.waiting > 0 && <> · <strong>{run.waiting}</strong> waiting</>}
              {" "}· of {run.assigned}
            </>
          )}
        </p>
      </div>
    </a>
  );
}

function ProgressBar({ completed, waiting, assigned }: { completed: number; waiting: number; assigned: number }) {
  const pctC = assigned ? Math.min(100, (completed / assigned) * 100) : 0;
  const pctW = assigned ? Math.min(100 - pctC, (waiting / assigned) * 100) : 0;
  return (
    <div style={{ height: 8, borderRadius: 999, background: "var(--calm-border)", overflow: "hidden", display: "flex" }}>
      <div style={{ width: `${pctC}%`, background: "#37796f" }} />
      <div style={{ width: `${pctW}%`, background: "var(--honey)" }} />
    </div>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 14, padding: "14px 16px" }}>
      <p style={{ margin: 0, font: "600 28px var(--font-fredoka)", color }}>{value}</p>
      <p style={{ margin: "2px 0 0", font: "700 13px var(--font-atkinson)", color: "var(--ink-soft)" }}>{label}</p>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 999, border: "2px solid var(--calm-border)", background: "var(--cream)",
  color: "var(--ink)", cursor: "pointer", font: "700 16px var(--font-atkinson)", display: "inline-flex", alignItems: "center", justifyContent: "center",
};
const chip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", font: "700 14px var(--font-atkinson)",
  border: "2px solid var(--calm-border)", borderRadius: 999, padding: "7px 14px",
};
const tag = (color: string, bg: string): React.CSSProperties => ({
  font: "700 12px var(--font-atkinson)", color, background: bg, borderRadius: 999, padding: "3px 10px",
});
