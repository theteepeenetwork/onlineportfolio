"use client";

import { useActionState, useState } from "react";
import { addOfficeHoursClosure, removeOfficeHoursClosure, saveOfficeHours } from "@/app/actions/messaging";
import {
  EARLIEST_OPEN_MINUTE,
  LATEST_CLOSE_MINUTE,
  MAX_WINDOW_MINUTES,
  WEEKDAY_NAMES,
  formatMinute,
  toTimeValue,
} from "@/lib/messaging/officeHours";
import { CARD, type Tab } from "./tabs";

// The school's parent-messaging controls (SAFEGUARDING.md rule 21).
//
// This is the whole of what a school decides: whether parents can message
// staff at all, and the hours inside which anything is delivered. StoryJar's
// caps are printed next to the form rather than hidden in validation, because
// a business manager setting this up should be able to see the limit before
// they hit it. Every save is checked again on the server; the form cannot
// widen anything.

export type MessagingPaneProps = {
  onSchoolPlan: boolean;
  frozen: boolean;
  enabled: boolean;
  windows: Array<{ weekday: number; openMinute: number; closeMinute: number }>;
  closures: Array<{ id: string; date: string; label: string }>;
};

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
};

const NOTE: React.CSSProperties = { margin: "8px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" };

// Monday first, the way a school thinks about a week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_OPEN = 8 * 60;
const DEFAULT_CLOSE = 16 * 60;

function Flash({ text, tone }: { text: string; tone: "good" | "bad" }) {
  const good = tone === "good";
  return (
    <p role={good ? "status" : "alert"} style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: good ? "#2E6B64" : "#C2476B", background: good ? "#D8ECE8" : "#F7E0E6", borderRadius: 10, padding: "10px 14px" }}>
      {text}
    </p>
  );
}

export function MessagesPane({ messaging, onGoTo }: { messaging: MessagingPaneProps; onGoTo: (t: Tab) => void }) {
  if (!messaging.onSchoolPlan) {
    return (
      <div style={{ ...CARD, marginTop: 24, padding: "24px 26px" }}>
        <h2 style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>Parent messages are part of the school plan</h2>
        <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B", maxWidth: 680 }}>
          Families can write to their child&rsquo;s teacher, and staff can reply, only inside office hours that the
          <strong> school</strong> sets. Nothing is delivered outside them, in either direction, and no teacher can change
          that on their own. That is why it comes with the school plan: it needs somebody at the school to hold the hours.
        </p>
        <button onClick={() => onGoTo("billing")} style={{ ...JAM_BTN, marginTop: 18 }}>See the school plan →</button>
      </div>
    );
  }
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p style={{ margin: "18px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 720 }}>
        Families can write to their child&rsquo;s teacher, and staff can reply. <strong>Nothing is delivered outside the
        hours you set here</strong> — a parent who writes at nine in the evening is told their message will reach the
        teacher when the school next opens, and a teacher who replies late is held to the same hours. You choose the
        hours; nobody on your staff can change them.
      </p>
      {messaging.frozen && (
        <Flash tone="bad" text="Your school plan is paused, so nobody can send a message just now. Conversations already had are still there to read. You can still set the hours here, ready for when the plan is renewed." />
      )}
      <HoursForm messaging={messaging} />
      <ClosuresCard closures={messaging.closures} />
      <div style={{ ...CARD, marginTop: 18, padding: "18px 22px" }}>
        <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>What families are told</h2>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20, font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B" }}>
          <li>Messages are not for emergencies. If a child is unwell or the school is needed now, phone the office. This sits above the box every time.</li>
          <li>When they send outside school hours, exactly when the teacher will get it — the day and the time, not a countdown.</li>
          <li>Which members of staff can see the conversation.</li>
        </ul>
        <p style={NOTE}>
          Who may reply to families is set per member of staff on the <button onClick={() => onGoTo("staff")} style={{ font: "inherit", color: "#22304A", background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer" }}>Staff</button> tab. Teachers and admins may by default; teaching assistants may not until you say so.
        </p>
      </div>
    </div>
  );
}

function HoursForm({ messaging }: { messaging: MessagingPaneProps }) {
  const [state, action, pending] = useActionState(saveOfficeHours, {});
  const byDay = new Map(messaging.windows.map((w) => [w.weekday, w]));
  const [on, setOn] = useState<Record<number, boolean>>(() => Object.fromEntries(WEEK_ORDER.map((d) => [d, byDay.has(d)])));

  return (
    <form action={action} style={{ ...CARD, marginTop: 20, padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 10, font: "700 17px var(--font-atkinson)", cursor: "pointer" }}>
          <input type="checkbox" name="enabled" defaultChecked={messaging.enabled} style={{ width: 22, height: 22, accentColor: "#C2476B" }} />
          Parent messages are on for {messaging.enabled ? "this school" : "this school (off just now)"}
        </label>
      </div>
      <p style={NOTE}>
        Up to <strong>{MAX_WINDOW_MINUTES / 60} hours a day</strong>, between <strong>{formatMinute(EARLIEST_OPEN_MINUTE)}</strong> and{" "}
        <strong>{formatMinute(LATEST_CLOSE_MINUTE)}</strong>. StoryJar sets those limits; you choose where your school&rsquo;s hours sit
        inside them. A day that is unticked is closed.
      </p>

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {WEEK_ORDER.map((d) => {
          const w = byDay.get(d);
          const checked = on[d];
          return (
            <div key={d} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) auto auto auto", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F5F0E6" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 10, font: "700 15px var(--font-atkinson)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name={`day-${d}`}
                  checked={checked}
                  onChange={(e) => setOn((prev) => ({ ...prev, [d]: e.target.checked }))}
                  style={{ width: 20, height: 20, accentColor: "#37796f" }}
                />
                {WEEKDAY_NAMES[d]}
              </label>
              <label style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                <span className="sj-sr-only">{WEEKDAY_NAMES[d]} opens at</span>
                <input type="time" name={`open-${d}`} defaultValue={toTimeValue(w?.openMinute ?? DEFAULT_OPEN)} disabled={!checked} min={toTimeValue(EARLIEST_OPEN_MINUTE)} max={toTimeValue(LATEST_CLOSE_MINUTE)} step={300} style={{ ...INPUT, width: 120, opacity: checked ? 1 : 0.45 }} aria-label={`${WEEKDAY_NAMES[d]} opens at`} />
              </label>
              <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }} aria-hidden>to</span>
              <label style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                <span className="sj-sr-only">{WEEKDAY_NAMES[d]} closes at</span>
                <input type="time" name={`close-${d}`} defaultValue={toTimeValue(w?.closeMinute ?? DEFAULT_CLOSE)} disabled={!checked} min={toTimeValue(EARLIEST_OPEN_MINUTE)} max={toTimeValue(LATEST_CLOSE_MINUTE)} step={300} style={{ ...INPUT, width: 120, opacity: checked ? 1 : 0.45 }} aria-label={`${WEEKDAY_NAMES[d]} closes at`} />
              </label>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" disabled={pending} style={{ ...JAM_BTN, opacity: pending ? 0.7 : 1 }}>{pending ? "Saving…" : "Save office hours"}</button>
        <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>Any message already waiting is re-timed to the new hours the moment you save.</span>
      </div>
      {state.error && <Flash tone="bad" text={state.error} />}
      {state.saved && !state.error && <Flash tone="good" text="✓ Saved. These hours apply to every class in the school." />}
    </form>
  );
}

function ClosuresCard({ closures }: { closures: MessagingPaneProps["closures"] }) {
  const [state, action, pending] = useActionState(addOfficeHoursClosure, {});
  return (
    <div style={{ ...CARD, marginTop: 18, padding: "20px 24px" }}>
      <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>Days the school is closed</h2>
      <p style={NOTE}>INSET days, bank holidays, the last day of term. Messages written on a closed day wait for the next open one.</p>
      {closures.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {closures.map((c) => (
            <li key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #F5F0E6" }}>
              <span style={{ font: "700 15px var(--font-atkinson)", minWidth: 120 }}>{formatClosureDate(c.date)}</span>
              <span style={{ font: "400 15px var(--font-atkinson)", color: "#43506B", flex: 1 }}>{c.label || "Closed"}</span>
              <form action={removeOfficeHoursClosure}>
                <input type="hidden" name="closureId" value={c.id} />
                <button type="submit" style={QUIET_BTN} aria-label={`Remove the closure on ${formatClosureDate(c.date)}`}>Remove</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={action} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "end", marginTop: 14 }}>
        <div>
          <label htmlFor="closure-date" style={{ display: "block", font: "700 13px var(--font-atkinson)", marginBottom: 5 }}>Date</label>
          <input id="closure-date" name="date" type="date" required style={INPUT} />
        </div>
        <div>
          <label htmlFor="closure-label" style={{ display: "block", font: "700 13px var(--font-atkinson)", marginBottom: 5 }}>What it is (optional)</label>
          <input id="closure-label" name="label" placeholder="e.g. INSET day" maxLength={40} style={{ ...INPUT, width: "100%" }} />
        </div>
        <button type="submit" disabled={pending} style={{ ...QUIET_BTN, opacity: pending ? 0.7 : 1 }}>{pending ? "Adding…" : "Add a closed day"}</button>
      </form>
      {state.error && <Flash tone="bad" text={state.error} />}
    </div>
  );
}

function formatClosureDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
