"use client";

import { useActionState, useState } from "react";
import { retractNotice, sendNotice } from "@/app/actions/notices";
import { NOTICE_MAX_BODY, NOTICE_MAX_TITLE, NOTICE_NO_NAMES_LINE } from "@/lib/notices";
import type { StaffNoticeView } from "@/lib/noticeBoard";
import { CARD, type Tab } from "./tabs";

// Notices, from the office's side (SAFEGUARDING rule 24).
//
// The whole school, or chosen classes. One-way: there is no reply to read here
// because there is no reply anywhere — and the pane says so, because an office
// that expected answers to arrive somewhere would go looking for them.
//
// THE STANDING LINE IS THE ONE THING THIS SCREEN ASKS OF A SENDER. A
// whole-school notice naming a child is a disclosure to every other family, and
// nothing can do better than a warning where the words are typed. The residual
// is recorded rather than argued away (docs/DPIA.md, R22); "Take down" is the
// remedy.

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

export type NoticesPaneProps = {
  onSchoolPlan: boolean;
  classes: Array<{ id: string; name: string }>;
  /** Everything the school has sent, newest first, taken-down ones included. */
  sent: StaffNoticeView[];
};

export function NoticesPane({ notices: pane, onGoTo }: { notices: NoticesPaneProps; onGoTo: (t: Tab) => void }) {
  const [state, action, pending] = useActionState(sendNotice, {});
  const [open, setOpen] = useState(false);
  // Controlled, so a refusal does not throw away what somebody has just typed —
// and the form CANCELS React's post-action reset (`onReset`), because that reset
// restores controlled text inputs but not controlled checkboxes and radios: on
// 10 September 2026 the evenings form came back from a refusal with every class
// unticked while its preview line still counted them. Found by a test, not by
// reading; the parents' evening spec asserts the ticks survive.
  const [title, setTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [audience, setAudience] = useState<"SCHOOL" | "CLASSES">("SCHOOL");
  const [picked, setPicked] = useState<string[]>([]);

  if (!pane.onSchoolPlan) {
    return (
      <div style={{ ...CARD, marginTop: 24, padding: "24px 26px" }}>
        <h2 style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>Notices are part of the school plan</h2>
        <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B", maxWidth: 680 }}>
          A school sends a notice to every family at once, or to whole classes, and nobody has to reply. A teacher on
          their own plan has one class and no office to speak for.
        </p>
        <button onClick={() => onGoTo("billing")} style={{ ...JAM_BTN, marginTop: 18 }}>See the school plan →</button>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p style={{ margin: "18px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 720 }}>
        A notice goes to every family you send it to and appears in their family space straight away. It is one-way:
        families cannot reply to it, and it is not held to office hours or emailed, because nothing comes back to a
        teacher from it.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} style={{ ...JAM_BTN, marginTop: 18 }}>Send a notice</button>
      ) : (
        <form action={action} onReset={(e) => e.preventDefault()} style={{ ...CARD, marginTop: 18, padding: "18px 22px" }}>
          <label style={LABEL}>
            Title
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={NOTICE_MAX_TITLE}
              placeholder="e.g. School closed on Friday 12 September"
              style={{ ...INPUT, display: "block", marginTop: 6, width: "min(520px, 100%)" }}
            />
          </label>
          <label style={{ ...LABEL, marginTop: 14 }}>
            The notice
            <textarea
              name="noticeBody"
              value={noticeBody}
              onChange={(e) => setNoticeBody(e.target.value)}
              rows={6}
              maxLength={NOTICE_MAX_BODY}
              style={{ ...INPUT, display: "block", marginTop: 6, width: "min(680px, 100%)" }}
            />
          </label>
          <p style={NOTE}>{NOTICE_NO_NAMES_LINE} Families read it exactly as you write it.</p>

          <fieldset style={{ border: "none", margin: "16px 0 0", padding: 0 }}>
            <legend style={{ font: "700 14px var(--font-atkinson)", color: "#22304A", padding: 0 }}>Who is it for?</legend>
            {(["SCHOOL", "CLASSES"] as const).map((a) => (
              <label key={a} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 44, font: "400 16px var(--font-atkinson)", color: "#22304A", cursor: "pointer" }}>
                <input type="radio" name="audience" value={a} checked={audience === a} onChange={() => setAudience(a)} style={{ width: 22, height: 22 }} />
                {a === "SCHOOL" ? "The whole school" : "Chosen classes"}
              </label>
            ))}
          </fieldset>

          {audience === "CLASSES" && (
            <fieldset style={{ border: "none", margin: "12px 0 0 32px", padding: 0 }}>
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
                    {c.name}
                  </label>
                ))
              )}
            </fieldset>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button type="submit" disabled={pending} style={JAM_BTN}>{pending ? "Sending…" : "Send the notice"}</button>
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

      {pane.sent.length > 0 && (
        <div style={{ ...CARD, marginTop: 18, padding: "18px 22px" }}>
          <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>Sent</h2>
          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 12 }}>
            {pane.sent.map((n) => (
              <li key={n.id} style={{ borderTop: "1px solid #F0EADD", paddingTop: 12, opacity: n.retracted ? 0.6 : 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <strong style={{ font: "700 16px var(--font-atkinson)", color: "#22304A" }}>{n.title}</strong>
                  <span style={{ font: "700 11px var(--font-atkinson)", color: "#2E6B64", background: "#D8ECE8", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{n.scope}</span>
                  {n.retracted && <span style={{ font: "700 12px var(--font-atkinson)", color: "var(--sj-muted)" }}>taken down{n.retractedByName ? ` by ${n.retractedByName}` : ""}</span>}
                </div>
                <p style={NOTE}>From {n.from} · {n.sentOn}</p>
                <p style={{ margin: "8px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B", whiteSpace: "pre-wrap" }}>{n.noticeBody}</p>
                {!n.retracted && n.canRetract && (
                  <form action={retractNotice} style={{ marginTop: 10 }}>
                    <input type="hidden" name="noticeId" value={n.id} />
                    <button type="submit" style={QUIET_BTN}>Take down</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
