"use client";

import { useActionState, useState } from "react";
import { moveClassUp, archiveLeavers, type RolloverState } from "@/app/actions/rollover";
import { AGE_MODE_OPTIONS } from "@/lib/ageMode";
import { CARD, type Tab } from "./tabs";

// The September job, on one screen (docs/paid-tier-plan.md item 1).
//
// Mrs Hartley's words, which this exists to answer: "Doing it by hand means
// recreating every class, re-typing every child's name, and re-issuing every
// code and letter — and last year's work does not follow the child."
//
// SAFEGUARDING rule 5 holds throughout. This screen deals in class names,
// counts and staff names. No moment, no child's name, nothing a child made.
//
// THE COSTS ARE PRINTED BEFORE THE PRESS, not discovered after it — the same
// rule `handoverSummary` follows for a staff handover, and for the same reason:
// a school that finds out afterwards that thirty children need a new code has
// been ambushed by its own admin screen.

const INPUT: React.CSSProperties = {
  boxSizing: "border-box",
  font: "400 16px var(--font-atkinson)",
  padding: "9px 11px",
  border: "3px solid #22304A",
  borderRadius: 10,
  background: "#FAF6EE",
  color: "#22304A",
};

const JAM_BTN: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "#FAF6EE",
  background: "#C2476B",
  border: "none",
  borderRadius: 999,
  padding: "12px 24px",
  cursor: "pointer",
  boxShadow: "0 3px 0 #93304F",
};

const QUIET_BTN: React.CSSProperties = {
  font: "700 14px var(--font-atkinson)",
  color: "#22304A",
  background: "#FFFDF7",
  border: "2px solid #22304A",
  borderRadius: 999,
  padding: "8px 16px",
  cursor: "pointer",
  minHeight: 44,
};

const NOTE: React.CSSProperties = { margin: "8px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" };

export type RolloverClass = {
  id: string;
  name: string;
  yearGroup: string | null;
  ageMode: string | null;
  teacherId: string;
  teacherName: string;
  children: number;
  /** Work still waiting for approval. Non-zero blocks the move — see the action. */
  pending: number;
};

export type RolloverPaneProps = {
  onSchoolPlan: boolean;
  /** Refused while the school plan is unpaid, like every other class move. */
  verified: boolean;
  classes: RolloverClass[];
  /**
   * What this school has already moved or archived, newest first, in the words
   * the action recorded. Read from the audit log on the server — see the long
   * comment where it is loaded, and do not move it back into the browser.
   */
  moved: { id: string; detail: string }[];
  /** Archived classes, so a school can see what it has finished with. */
  archived: { id: string; name: string; yearGroup: string | null; archivedAt: string }[];
  staff: { id: string; name: string }[];
};

function Flash({ text, tone }: { text: string; tone: "good" | "bad" }) {
  const good = tone === "good";
  return (
    <p role={good ? "status" : "alert"} style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: good ? "#2E6B64" : "#C2476B", background: good ? "#D8ECE8" : "#F7E0E6", borderRadius: 10, padding: "10px 14px" }}>
      {text}
    </p>
  );
}

/** Next year's default name, from this one. "Year 2" → "Year 3"; anything else is left alone. */
function suggestYearGroup(yearGroup: string | null): string {
  if (!yearGroup) return "";
  const m = yearGroup.match(/^(\D*?)(\d+)(\D*)$/);
  if (!m) return yearGroup;
  return `${m[1]}${Number(m[2]) + 1}${m[3]}`;
}

/** "2026-27" from today, so an admin doing this in July gets next year, not this one. */
function suggestAcademicYear(now = new Date()): string {
  // A school year turns in the summer, so anything from August onwards is
  // already next year's. Computed from the server-rendered `now` the page
  // passes down would be better still; this is a default in a text box a person
  // can overwrite, not a rule anything depends on.
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y + 1}-${String((y + 2) % 100).padStart(2, "0")}`;
}

export function RolloverPane({ rollover, onGoTo }: { rollover: RolloverPaneProps; onGoTo: (t: Tab) => void }) {
  if (!rollover.onSchoolPlan) {
    return (
      <div style={{ ...CARD, marginTop: 24, padding: "24px 26px" }}>
        <h2 style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>Moving classes up is part of the school plan</h2>
        <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B", maxWidth: 680 }}>
          In September a school moves each class up a year and hands it to its new teacher, and the children&rsquo;s
          work follows them. A teacher on their own plan has one register and no handover to do.
        </p>
        <button onClick={() => onGoTo("billing")} style={{ ...JAM_BTN, marginTop: 18 }}>
          See the school plan →
        </button>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p style={{ margin: "18px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 720 }}>
        One row per class. Choose next year&rsquo;s teacher, name and year group, and the children move across with
        their work. <strong>Nothing is ever deleted here.</strong> Last year&rsquo;s class is kept, with last
        year&rsquo;s work still in it and still labelled with the class it was made in.
      </p>

      {rollover.moved.length > 0 && (
        // A RECORD, NOT A FLASH. Read from the audit log on the server, so it
        // survives the row that produced it being replaced — and survives the
        // tab being closed and reopened, which is what an admin working through
        // a whole school over an afternoon needs.
        <div role="status" style={{ ...CARD, marginTop: 18, padding: "16px 20px", background: "#D8ECE8", borderColor: "#2E6B64" }}>
          <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)", color: "#2E6B64" }}>What you have moved</h2>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, font: "400 15px/1.7 var(--font-atkinson)", color: "#22304A" }}>
            {rollover.moved.map((m) => (
              <li key={m.id}>{m.detail}</li>
            ))}
          </ul>
        </div>
      )}

      {!rollover.verified && (
        <Flash
          tone="bad"
          text="Moving classes waits until the school plan has been paid for. Everything else — teaching, the register, the audit log — carries on as normal."
        />
      )}

      <div style={{ ...CARD, marginTop: 20, padding: "18px 22px" }}>
        <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>Before you start</h2>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20, font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B" }}>
          <li>
            <strong>Every class gets a new class code</strong>, so every child needs telling. There is no way round
            it: the old code signs somebody in as any child in the class, and a class that has changed hands must not
            keep it.
          </li>
          <li>
            <strong>Family codes do not change.</strong> A code belongs to a household, not a class, so no family
            letter has to be re-issued.
          </li>
          <li>
            <strong>Clear the approval queue first.</strong> Work still waiting is left with the teacher who set it,
            so a class with anything pending cannot move yet.
          </li>
          <li>
            <strong>The register is not changed for you.</strong> A class moving from Year 2 to Year 3 keeps the
            words and type size it had unless somebody chooses otherwise, here, on purpose.
          </li>
        </ul>
      </div>

      {rollover.classes.length === 0 ? (
        <div style={{ ...CARD, marginTop: 18, padding: "20px 24px" }}>
          <p style={{ margin: 0, font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
            There are no classes to move. Classes appear here once staff have set them up on the{" "}
            <button onClick={() => onGoTo("classes")} style={{ font: "inherit", color: "#22304A", background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer" }}>
              Classes
            </button>{" "}
            tab.
          </p>
        </div>
      ) : (
        rollover.classes.map((c) => (
          <ClassRow key={c.id} klass={c} staff={rollover.staff} disabled={!rollover.verified} />
        ))
      )}

      {rollover.archived.length > 0 && (
        <div style={{ ...CARD, marginTop: 20, padding: "18px 22px" }}>
          <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>Finished classes</h2>
          <p style={NOTE}>
            Classes that have stopped teaching. Their work is still held and each child&rsquo;s own page still shows
            everything they made — archiving is not deletion, and how long it is kept is in the retention schedule on
            the{" "}
            <button onClick={() => onGoTo("promises")} style={{ font: "inherit", color: "#22304A", background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer" }}>
              Promises
            </button>{" "}
            tab.
          </p>
          <ul style={{ margin: "10px 0 0", paddingLeft: 20, font: "400 15px/1.7 var(--font-atkinson)", color: "#43506B" }}>
            {rollover.archived.map((a) => (
              <li key={a.id}>
                {a.name}
                {a.yearGroup ? ` · ${a.yearGroup}` : ""} — finished {a.archivedAt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ClassRow({ klass, staff, disabled }: { klass: RolloverClass; staff: { id: string; name: string }[]; disabled: boolean }) {
  const [moveState, moveAction, movePending] = useActionState<RolloverState | undefined, FormData>(moveClassUp, {});
  const [leaveState, leaveAction, leavePending] = useActionState<RolloverState | undefined, FormData>(archiveLeavers, {});
  const [leaving, setLeaving] = useState(false);
  const blocked = klass.pending > 0;


  return (
    <div style={{ ...CARD, marginTop: 18, padding: "18px 22px" }}>
      <h3 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>
        {klass.name}
        {klass.yearGroup ? <span style={{ font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}> · {klass.yearGroup}</span> : null}
      </h3>
      <p style={NOTE}>
        {klass.children} {klass.children === 1 ? "child" : "children"} · {klass.teacherName}
        {blocked ? ` · ${klass.pending} waiting to be approved` : ""}
      </p>

      {blocked ? (
        // Said as a fact with the person who can fix it named, rather than as a
        // disabled control with no explanation. Sam the TA's persona finding —
        // "nothing says what I'm allowed to do, I found out by pressing things" —
        // applies to an admin meeting a locked row just as much.
        <p role="note" style={{ margin: "12px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "#7A5210", background: "#FBEED3", borderRadius: 10, padding: "10px 14px" }}>
          {klass.name} cannot move yet: {klass.pending} {klass.pending === 1 ? "piece" : "pieces"} of work{" "}
          {klass.pending === 1 ? "is" : "are"} still waiting to be approved. Work left waiting stays with{" "}
          {klass.teacherName} after the children have moved on, so ask them to clear the queue first.
        </p>
      ) : leaving ? (
        <form action={leaveAction} style={{ marginTop: 12 }}>
          <input type="hidden" name="classId" value={klass.id} />
          <p style={{ margin: 0, font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B" }}>
            {klass.name} is leaving and has no next year. The children and everything they made stay exactly where
            they are — <strong>nothing is deleted</strong> — and the class simply stops teaching. Ask{" "}
            {klass.teacherName} to export the class first if the school wants a copy to hand on.
          </p>
          <label style={{ display: "block", marginTop: 12, font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
            Type <strong>{klass.name}</strong> to confirm
            <input name="confirmName" style={{ ...INPUT, display: "block", marginTop: 6, width: "min(320px, 100%)" }} />
          </label>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="submit" disabled={disabled || leavePending} style={JAM_BTN}>
              {leavePending ? "Archiving…" : "Archive as leavers"}
            </button>
            <button type="button" onClick={() => setLeaving(false)} style={QUIET_BTN}>
              Cancel
            </button>
          </div>
          {/* Only the refusal. A SUCCESS cannot render here: archiving removes
              this row in the same commit that delivers the result, so a "done"
              flash inside it would be written into a component that no longer
              exists. The outcome is the server-read record above. */}
          {leaveState?.error && <Flash tone="bad" text={leaveState.error} />}
        </form>
      ) : (
        <form action={moveAction} style={{ marginTop: 12 }}>
          <input type="hidden" name="classId" value={klass.id} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
              Next year&rsquo;s name
              <input name="name" defaultValue={klass.name} style={{ ...INPUT, display: "block", marginTop: 6, width: 200 }} />
            </label>
            <label style={{ font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
              Year group
              <input name="yearGroup" defaultValue={suggestYearGroup(klass.yearGroup)} placeholder="e.g. Year 3" style={{ ...INPUT, display: "block", marginTop: 6, width: 150 }} />
            </label>
            <label style={{ font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
              School year
              <input name="academicYear" defaultValue={suggestAcademicYear()} style={{ ...INPUT, display: "block", marginTop: 6, width: 120 }} />
            </label>
            <label style={{ font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
              Next year&rsquo;s teacher
              <select name="teacherId" defaultValue={klass.teacherId} style={{ ...INPUT, display: "block", marginTop: 6, width: 220 }}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
              Register
              <select name="ageMode" defaultValue={klass.ageMode ?? "EYFS"} style={{ ...INPUT, display: "block", marginTop: 6, width: 220 }}>
                {AGE_MODE_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {/* Carried across, never bumped. The choice is a person's, and saying so
              beside the control is what stops it being read as a default the app
              has already made. */}
          <p style={NOTE}>
            The register stays as it is unless you change it here. StoryJar never works it out from the year group.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button type="submit" disabled={disabled || movePending} style={JAM_BTN}>
              {movePending ? "Moving…" : `Move ${klass.children} up`}
            </button>
            <button type="button" onClick={() => setLeaving(true)} style={QUIET_BTN}>
              They&rsquo;re leaving
            </button>
          </div>
          {/* Only the refusal — see the note on the leavers form below. */}
          {moveState?.error && <Flash tone="bad" text={moveState.error} />}
        </form>
      )}
    </div>
  );
}
