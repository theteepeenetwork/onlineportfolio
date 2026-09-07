"use client";

import { useActionState, useEffect, useRef } from "react";
import { formatLondonStamp } from "@/lib/messaging/officeHours";
import type { ThreadView } from "@/lib/messaging/threads";
import type { SendState } from "@/app/actions/messaging";

// The conversation about one child, as either side sees it, and the box to
// write in. Shared by the family space and the teacher's messages screen so
// the two sides read the same rule in the same words (SAFEGUARDING rule 21):
//
//   • the emergency line sits above the box every time — a channel that is
//     shut for most of the day must never look like the place for a crisis;
//   • a message sent outside school hours says exactly when it will arrive,
//     the day and the time, never a countdown;
//   • a held message of your own is shown greyed with that label; the other
//     side sees nothing of it until then;
//   • a message body is plain text. React escapes it, and a URL in it is a
//     URL to read, never a link to press (rule 15).

// Composed by hand in officeHours.ts, not by Intl's combined format: server
// and browser ICUs punctuate en-GB differently and the page would fail to
// hydrate over a comma.
function stamp(iso: string): string {
  return formatLondonStamp(new Date(iso));
}

const TEXTAREA: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 96,
  resize: "vertical",
  font: "400 16px/1.5 var(--font-atkinson)",
  padding: "12px 14px",
  border: "3px solid var(--ink)",
  borderRadius: 12,
  background: "var(--cream)",
  color: "var(--ink)",
};

export function ThreadPanel({
  view,
  viewer,
  send,
  emergencyLine,
  emptyLine,
}: {
  view: ThreadView;
  viewer: "PARENT" | "STAFF";
  send: (prev: SendState | undefined, formData: FormData) => Promise<SendState>;
  emergencyLine: string;
  emptyLine: string;
}) {
  const [state, action, pending] = useActionState(send, {});
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state.sent) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);

  const recipient = view.recipientName;

  return (
    <div>
      {view.messages.length === 0 ? (
        <p style={{ margin: 0, font: "400 15px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>{emptyLine}</p>
      ) : (
        <ol aria-label="Messages" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {view.messages.map((m) => {
            const own = m.mine || (viewer === "PARENT" ? m.from === "PARENT" : m.from === "TEACHER");
            return (
              <li key={m.id} style={{ display: "flex", justifyContent: own ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "min(560px, 92%)",
                    background: own ? "#F3E3C3" : "var(--cream)",
                    border: `2px solid ${m.delivered ? "var(--calm-border)" : "#C4CDDD"}`,
                    borderRadius: 14,
                    padding: "10px 14px",
                    // A held message reads as "not there yet" through its border
                    // and a dashed edge rather than through faded text, which
                    // would fail AA contrast on exactly the line that matters.
                    borderStyle: m.delivered ? "solid" : "dashed",
                  }}
                >
                  <p style={{ margin: 0, font: "700 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                    {m.senderLabel} · <time dateTime={m.writtenAtISO}>{stamp(m.writtenAtISO)}</time>
                  </p>
                  <p style={{ margin: "5px 0 0", font: "400 16px/1.5 var(--font-atkinson)", color: "var(--ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.messageBody}</p>
                  {!m.delivered && m.arrives && (
                    <p style={{ margin: "6px 0 0", font: "700 13px var(--font-atkinson)", color: "#7A5210" }}>
                      Will reach {m.from === "PARENT" ? recipient : `${view.childName}’s family`} {m.arrives}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {view.canSend ? (
        <form ref={formRef} action={action} style={{ marginTop: 18 }}>
          <input type="hidden" name="studentId" value={view.studentId} />
          <p style={{ margin: "0 0 8px", font: "700 14px/1.5 var(--font-atkinson)", color: "var(--jam)" }}>{emergencyLine}</p>
          <label htmlFor={`msg-${view.studentId}`} className="sj-sr-only">Your message</label>
          <textarea id={`msg-${view.studentId}`} name="messageBody" required maxLength={2000} placeholder={viewer === "PARENT" ? `Write to ${recipient}…` : `Write to ${view.childName}’s family…`} style={TEXTAREA} />
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={pending}
              style={{ font: "700 16px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "none", padding: "12px 24px", borderRadius: 999, boxShadow: "0 3px 0 var(--jam-deep)", cursor: "pointer", opacity: pending ? 0.7 : 1 }}
            >
              {pending ? "Sending…" : "Send"}
            </button>
            <span style={{ font: "400 14px/1.5 var(--font-atkinson)", color: "var(--sj-muted)" }}>
              {view.openNow
                ? view.hoursSummary
                : view.nextOpening
                  ? `School hours are closed just now. Anything you send will reach ${viewer === "PARENT" ? recipient : `${view.childName}’s family`} ${view.nextOpening}.`
                  : view.hoursSummary}
            </span>
          </div>
          {state.error && (
            <p role="alert" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--jam)", background: "var(--error-tint)", borderRadius: 10, padding: "10px 14px" }}>{state.error}</p>
          )}
          {state.sent && !state.error && (
            <p role="status" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", borderRadius: 10, padding: "10px 14px" }}>
              {state.sent.held && state.sent.arrives
                ? `✓ Sent. It’s outside school hours, so ${viewer === "PARENT" ? recipient : `${view.childName}’s family`} will get this ${state.sent.arrives}.`
                : "✓ Sent."}
            </p>
          )}
        </form>
      ) : view.cannotSendReason ? (
        <p style={{ margin: "18px 0 0", font: "400 15px/1.55 var(--font-atkinson)", color: "var(--sj-muted)", background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 12, padding: "12px 14px" }}>
          {view.cannotSendReason}
        </p>
      ) : null}
    </div>
  );
}
