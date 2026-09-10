"use client";

import { useActionState, useState } from "react";
import { retractNotice, sendNotice } from "@/app/actions/notices";
import { NOTICE_MAX_BODY, NOTICE_MAX_TITLE, NOTICE_NO_NAMES_LINE } from "@/lib/notices";
import type { StaffNoticeView } from "@/lib/noticeBoard";

// "Send a notice to your class" — a teacher's side of SAFEGUARDING rule 24.
//
// Only the classes they hold are offered, and the action re-resolves that with
// the school and the holder; the picker is a convenience. One class is the
// common case and gets no picker at all — a hidden field and a sentence.
//
// THE STANDING LINE is the same one the office sees, because a class notice
// naming a child is still a disclosure to every other family in that class.

const INPUT: React.CSSProperties = {
  boxSizing: "border-box",
  font: "400 16px var(--font-atkinson)",
  padding: "9px 11px",
  border: "3px solid var(--ink)",
  borderRadius: 10,
  background: "var(--cream)",
  color: "var(--ink)",
};

const QUIET_BTN: React.CSSProperties = {
  font: "700 14px var(--font-atkinson)",
  color: "var(--ink)",
  background: "var(--paper)",
  border: "2px solid var(--ink)",
  borderRadius: 999,
  padding: "9px 16px",
  cursor: "pointer",
  minHeight: 44,
};

export function SendClassNotice({
  classes,
  sent,
}: {
  classes: Array<{ id: string; name: string }>;
  sent: StaffNoticeView[];
}) {
  const [state, action, pending] = useActionState(sendNotice, {});
  // Controlled fields, and the form cancels React's post-action reset — the
  // reset puts back controlled text but not a controlled checkbox, so a refused
  // send would otherwise untick the class while the state still held it (found
  // on the evenings form, 10 September 2026).
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [picked, setPicked] = useState<string[]>(classes.length === 1 ? [classes[0].id] : []);

  return (
    <section aria-labelledby="class-notice-heading" style={{ marginTop: 22, background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "16px 20px" }}>
      <h2 id="class-notice-heading" style={{ margin: 0, font: "600 18px var(--font-fredoka)", color: "var(--ink)" }}>Send a notice to your class</h2>
      <p style={{ margin: "6px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        &ldquo;PE kit tomorrow&rdquo;, &ldquo;trip letters back by Friday&rdquo; — one notice, every family in the class,
        and nobody can reply to it. It appears in their family space straight away and is not held to office hours,
        because nothing comes back to you from it.
      </p>

      {!open ? (
        <button onClick={() => setOpen(true)} style={{ ...QUIET_BTN, marginTop: 12 }}>Write a notice…</button>
      ) : (
        <form action={action} onReset={(e) => e.preventDefault()} style={{ display: "grid", gap: 10, marginTop: 12, maxWidth: 620 }}>
          <input type="hidden" name="audience" value="CLASSES" />
          <label style={{ display: "grid", gap: 5, font: "700 13px var(--font-atkinson)", color: "var(--ink)" }}>
            Title
            <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={NOTICE_MAX_TITLE} style={INPUT} />
          </label>
          <label style={{ display: "grid", gap: 5, font: "700 13px var(--font-atkinson)", color: "var(--ink)" }}>
            The notice
            <textarea name="noticeBody" value={noticeBody} onChange={(e) => setNoticeBody(e.target.value)} rows={4} maxLength={NOTICE_MAX_BODY} style={{ ...INPUT, resize: "vertical", font: "400 15px/1.5 var(--font-atkinson)" }} />
          </label>
          <p style={{ margin: 0, font: "400 13px/1.5 var(--font-atkinson)", color: "var(--sj-muted)" }}>{NOTICE_NO_NAMES_LINE}</p>

          {classes.length === 1 ? (
            <>
              <input type="hidden" name="classIds" value={classes[0].id} />
              <p style={{ margin: 0, font: "400 14px var(--font-atkinson)", color: "var(--ink)" }}>To every family in <strong>{classes[0].name}</strong>.</p>
            </>
          ) : (
            <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
              <legend style={{ font: "700 13px var(--font-atkinson)", color: "var(--ink)", padding: 0 }}>Which classes?</legend>
              {classes.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, minHeight: 44, font: "400 15px var(--font-atkinson)", color: "var(--ink)", cursor: "pointer" }}>
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
              ))}
            </fieldset>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={pending} style={{ ...QUIET_BTN, background: "var(--ink)", color: "var(--paper)", opacity: pending ? 0.7 : 1 }}>{pending ? "Sending…" : "Send the notice"}</button>
            <button type="button" onClick={() => setOpen(false)} style={QUIET_BTN}>Cancel</button>
          </div>
          {state?.error && <p role="alert" style={{ margin: 0, font: "700 14px var(--font-atkinson)", color: "var(--jam)" }}>{state.error}</p>}
          {state?.done && <p role="status" style={{ margin: 0, font: "700 14px var(--font-atkinson)", color: "#2E6B64" }}>✓ {state.done}</p>}
        </form>
      )}

      {sent.length > 0 && (
        <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 10 }}>
          {sent.map((n) => (
            <li key={n.id} style={{ borderTop: "1px solid var(--calm-border)", paddingTop: 10, opacity: n.retracted ? 0.6 : 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>{n.title}</strong>
                <span style={{ font: "700 11px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{n.scope}</span>
                {n.retracted && <span style={{ font: "700 12px var(--font-atkinson)", color: "var(--sj-muted)" }}>taken down</span>}
              </div>
              <p style={{ margin: "4px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>From {n.from} · {n.sentOn}</p>
              {!n.retracted && n.canRetract && (
                <form action={retractNotice} style={{ marginTop: 8 }}>
                  <input type="hidden" name="noticeId" value={n.id} />
                  <button type="submit" style={QUIET_BTN}>Take down</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
