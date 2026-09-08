"use client";

import { useActionState, useState } from "react";
import { createMeetingEvent } from "@/app/actions/meetings";
import {
  MAX_SLOTS_PER_TEACHER,
  MEETING_EARLIEST_MINUTE,
  MEETING_LATEST_MINUTE,
  eveningErrorMessage,
  parseClock,
  slotMinutesFor,
  validateEvening,
} from "@/lib/meetings";
import { formatMinute } from "@/lib/messaging/officeHours";
import type { AdminEvening } from "@/lib/meetingBookings";
import { CARD, type Tab } from "./tabs";

// Parents' evening, from the office's side.
//
// WHAT THE OFFICE GETS IS COUNTS, AND WHY. How many appointments there are in
// 4B and how many are taken — enough to know whether another letter needs to go
// home. WHO is coming at 6:20 is the class teacher's list, because that is the
// adult who will be sitting there. Same line as a permission slip, held at the
// one place it would be easiest to let go, and permitted by the same clause of
// SAFEGUARDING rule 5.
//
// THE ARITHMETIC IS SHOWN BEFORE THE PRESS. Laying out an evening creates a row
// per appointment per class, and "6:00 to 8:00 in ten-minute slots across four
// classes" is 48 rows a school would otherwise discover afterwards. The count is
// computed by the same pure function the server uses (`slotMinutesFor`), so the
// number on the button is the number that gets made.

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
  minHeight: 44,
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
const LABEL: React.CSSProperties = { display: "block", font: "700 14px var(--font-atkinson)", color: "#22304A" };

export type EveningsPaneProps = {
  onSchoolPlan: boolean;
  classes: Array<{ id: string; name: string; teacherName: string }>;
  /** One line per class per evening. Counts only — never a child. */
  evenings: AdminEvening[];
};

const SLOT_CHOICES = [5, 10, 15, 20, 30];

export function EveningsPane({ evenings: pane, onGoTo }: { evenings: EveningsPaneProps; onGoTo: (t: Tab) => void }) {
  const [state, action, pending] = useActionState(createMeetingEvent, {});
  const [open, setOpen] = useState(false);
  // Controlled, so a refusal does not throw away the six fields somebody has
  // just filled in. Next resets an uncontrolled form after a server action.
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("16:00");
  const [endTime, setEndTime] = useState("18:00");
  const [slotMinutes, setSlotMinutes] = useState(10);
  const [opensAt, setOpensAt] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  if (!pane.onSchoolPlan) {
    return (
      <div style={{ ...CARD, marginTop: 24, padding: "24px 26px" }}>
        <h2 style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>Parents&rsquo; evening is part of the school plan</h2>
        <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B", maxWidth: 680 }}>
          A school picks the night and lays out appointments for whole classes at once. A teacher on their own plan has
          one class and no office to run the booking for them.
        </p>
        <button onClick={() => onGoTo("billing")} style={{ ...JAM_BTN, marginTop: 18 }}>See the school plan →</button>
      </div>
    );
  }

  const startMinute = parseClock(startTime);
  const endMinute = parseClock(endTime);
  const shape = { eventDate, startMinute: startMinute ?? -1, endMinute: endMinute ?? -1, slotMinutes };
  const problem = eventDate ? validateEvening(shape) : null;
  const perTeacher = problem || startMinute === null || endMinute === null ? 0 : slotMinutesFor(shape).length;
  const total = perTeacher * picked.length;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p style={{ margin: "18px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 720 }}>
        Pick the night, say how long an appointment is, and choose the classes. Families book their own time in their
        family space — no slips home, no phone calls, and a time a family gives up goes straight back on the list.
      </p>

      <div style={{ ...CARD, marginTop: 20, padding: "18px 22px" }}>
        <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>What you see, and what the teacher sees</h2>
        <p style={{ ...NOTE, marginTop: 10 }}>
          This page shows <strong>how many</strong> appointments each class has and how many are taken — enough to know
          whether another letter needs to go home. <strong>Who is coming at what time is the class teacher&rsquo;s own
          list</strong>, because they are the one who will be sitting there. Ask them if you need a name, exactly as you
          would have with a sheet on a clipboard.
        </p>
        <p style={NOTE}>
          Appointments can run between {formatMinute(MEETING_EARLIEST_MINUTE)} and {formatMinute(MEETING_LATEST_MINUTE)},
          and one teacher can have up to {MAX_SLOTS_PER_TEACHER} of them in an evening. StoryJar will not let you set one
          on a day your school is marked closed.
        </p>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} style={{ ...JAM_BTN, marginTop: 18 }}>Set up an evening</button>
      ) : (
        <form action={action} style={{ ...CARD, marginTop: 18, padding: "18px 22px" }}>
          <label style={LABEL}>
            What is it called?
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Autumn term parents' evening"
              style={{ ...INPUT, display: "block", marginTop: 6, width: "min(520px, 100%)" }}
            />
          </label>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
            <label style={LABEL}>
              Which evening?
              <input type="date" name="eventDate" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ ...INPUT, display: "block", marginTop: 6, width: 190 }} />
            </label>
            <label style={LABEL}>
              From
              <input type="time" name="startTime" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ ...INPUT, display: "block", marginTop: 6, width: 140 }} />
            </label>
            <label style={LABEL}>
              Until
              <input type="time" name="endTime" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ ...INPUT, display: "block", marginTop: 6, width: 140 }} />
            </label>
            <label style={LABEL}>
              How long is one?
              <select
                name="slotMinutes"
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(Number(e.target.value))}
                style={{ ...INPUT, display: "block", marginTop: 6, width: 150 }}
              >
                {SLOT_CHOICES.map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ ...LABEL, marginTop: 14 }}>
            Booking opens (optional)
            <input type="date" name="opensAt" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} style={{ ...INPUT, display: "block", marginTop: 6, width: 190 }} />
          </label>
          <p style={NOTE}>
            Leave it empty and families can book straight away. Set a date and the times are visible but not bookable
            until then — which is how a whole year group starts at once rather than whoever happens to be looking.
          </p>

          <fieldset style={{ border: "none", margin: "16px 0 0", padding: 0 }}>
            <legend style={{ font: "700 14px var(--font-atkinson)", color: "#22304A", padding: 0 }}>Which classes?</legend>
            {pane.classes.length === 0 ? (
              <p style={NOTE}>
                No classes yet. They appear here once staff have set them up on the{" "}
                <button type="button" onClick={() => onGoTo("classes")} style={{ font: "inherit", color: "#22304A", background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer" }}>
                  Classes
                </button>{" "}
                tab.
              </p>
            ) : (
              pane.classes.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 44, font: "400 16px var(--font-atkinson)", color: "#22304A", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    name="classIds"
                    value={c.id}
                    checked={picked.includes(c.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                    style={{ width: 22, height: 22 }}
                  />
                  {c.name} <span style={{ color: "var(--sj-muted)" }}>· {c.teacherName}</span>
                </label>
              ))
            )}
          </fieldset>

          {/* The arithmetic, before the press. Computed by the same function the
              server uses, so this is a preview rather than a second opinion. */}
          <p style={{ margin: "16px 0 0", font: "700 15px var(--font-atkinson)", color: problem ? "#C2476B" : "#22304A" }}>
            {problem
              ? eveningErrorMessage(problem)
              : total === 0
                ? "Pick an evening and at least one class to see how many appointments that makes."
                : `That makes ${perTeacher} appointment${perTeacher === 1 ? "" : "s"} for each of ${picked.length} ${picked.length === 1 ? "class" : "classes"} — ${total} in all.`}
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button type="submit" disabled={pending} style={JAM_BTN}>{pending ? "Setting up…" : "Set it up"}</button>
            <button type="button" onClick={() => setOpen(false)} style={QUIET_BTN}>Cancel</button>
          </div>
          {state?.error && (
            <p role="alert" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#C2476B", background: "#F7E0E6", borderRadius: 10, padding: "10px 14px" }}>{state.error}</p>
          )}
          {state?.done && (
            <p role="status" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#2E6B64", background: "#D8ECE8", borderRadius: 10, padding: "10px 14px" }}>{state.done}</p>
          )}
        </form>
      )}

      {pane.evenings.map((e) => (
        <div key={e.id} style={{ ...CARD, marginTop: 18, padding: "18px 22px" }}>
          <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>{e.title}</h2>
          <p style={NOTE}>
            {e.on} · set up by {e.createdBy}
            {e.opensOn ? ` · booking opens ${e.opensOn}` : ""}
          </p>
          {e.classes.map((c) => (
            <p key={c.className} style={{ margin: "10px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B" }}>
              <strong>{c.className}</strong> ({c.teacherName}) — {c.booked} of {c.slots} booked
              {c.booked === c.slots ? " · full" : `, ${c.slots - c.booked} still free`}
            </p>
          ))}
          <p style={NOTE}>
            Who is coming at which time is on that class teacher&rsquo;s own screen. Ask them if you need a name.
          </p>
        </div>
      ))}
    </div>
  );
}
