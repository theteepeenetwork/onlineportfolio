"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { OpsOperationState } from "@/app/actions/ops/operations";
import { REASON_MAX, REASON_MIN } from "@/lib/ops/dto";
import type { OpsOperationSpec } from "@/lib/ops/registry";

// One confirm pattern, for every named operation (PR4).
//
// Extracted on the first two rather than the fourth, because the pattern is
// what makes the fourth safe: an operation wired up by hand is an operation
// that gets a slightly different confirm, a slightly weaker warning, and
// eventually no reason box at all.
//
// WHY THIS IS NOT A MODAL DIALOG
//
// The obvious build is role="dialog" with aria-modal, a focus trap, Escape to
// close and a backdrop. It is also the build most likely to be subtly wrong:
// focus traps leak, backdrops swallow clicks on touch, and a dialog that fails
// to restore focus strands a keyboard user with no way back to the control they
// pressed. This is an inline two-step instead. The panel opens in place, in the
// reading order, immediately after its own trigger; there is nothing to trap
// because nothing is hidden behind it; and the only focus move is deliberate
// and one hop long. It is announced by moving focus to its heading, which reads
// the title and then the consequences in order.
//
// The trade is honest: an inline panel is easier to ignore than a modal. That
// is answered by what the panel contains rather than by how hard it is to
// dismiss. The consequences are sentences, the reason is required, and neither
// can be skipped by pressing return.
//
// THE REASON FIELD (ruling R16), and the two ways it is usually got wrong
//
//   1. Disabling submit until the reason is long enough. A disabled control is
//      unfocusable, announces nothing, and hands a keyboard or screen reader
//      user a dead end with no stated cause. Submit here is NEVER disabled, not
//      for a short reason and not while the request is in flight.
//   2. Validating in the browser and trusting it. The server re-checks and is
//      authoritative. The maxLength below is a convenience, not a control.
//
// The helper text warns against naming a child. No gate can catch a child's
// name typed into a free-text box, so this is a warning and not a control, and
// the residual risk is recorded in docs/DPIA.md rather than left implied.
//
// No status here is carried by colour. Every state this panel can be in says
// what it is in words.

export function ConfirmAction({
  spec,
  subjectId,
  action,
}: {
  spec: OpsOperationSpec;
  subjectId: string;
  action: (state: OpsOperationState, formData: FormData) => Promise<OpsOperationState>;
}) {
  const [state, submit, pending] = useActionState(action, {} as OpsOperationState);
  const [open, setOpen] = useState(false);
  // The last answer this panel has already shown. Closing a finished panel and
  // opening it again should offer a fresh form, not the outcome of last time.
  const [dismissed, setDismissed] = useState<number | undefined>(undefined);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLParagraphElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  // Where focus should land after the next render, set by whichever control was
  // pressed. This is an effect rather than a call inside the click handler for
  // a reason worth writing down: opening or closing the panel unmounts the
  // element that focus has to go to, so at the moment of the click the ref for
  // it is null. An effect runs after the commit, when the new element exists.
  // The first attempt used a zero-length timeout instead, and A28's "cancelling
  // puts focus back on the control that was pressed" caught it stranding focus
  // on the document body, which is exactly the dead end this pattern is for.
  const focusAfterRender = useRef<"trigger" | "panel" | null>(null);

  const answered = state.at !== undefined && state.at !== dismissed;
  const done = answered && state.ok === true;
  const refused = answered && state.ok === false;

  const base = `ops-op-${spec.id.toLowerCase()}`;
  const headingId = `${base}-heading`;
  const reasonId = `${base}-reason`;
  const helpId = `${base}-help`;
  const outcomeId = `${base}-outcome`;

  // 3.3.1: an error announced at the bottom of a page, with focus left where it
  // was, makes the person hunt for the field it is about.
  useEffect(() => {
    if (refused && state.field === "reason") reasonRef.current?.focus();
    else if (done) outcomeRef.current?.focus();
  }, [refused, done, state.field, state.at]);

  useEffect(() => {
    const want = focusAfterRender.current;
    if (!want) return;
    focusAfterRender.current = null;
    if (want === "trigger") triggerRef.current?.focus();
    else headingRef.current?.focus();
  }, [open]);

  const close = () => {
    setDismissed(state.at);
    focusAfterRender.current = "trigger";
    setOpen(false);
  };

  if (!open) {
    return (
      <p className="mt-4">
        <button
          type="button"
          ref={triggerRef}
          className="btn-ghost text-sm"
          onClick={() => {
            // The heading is the first thing in the panel, so moving focus
            // there reads the title and then every consequence in order.
            focusAfterRender.current = "panel";
            setOpen(true);
          }}
        >
          {spec.title}
        </button>
      </p>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      className="card mt-4 p-5"
      style={{ borderColor: "var(--calm-border)" }}
    >
      <p
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-lg"
        style={{ color: "var(--ink)" }}
      >
        {spec.title}
      </p>

      {done ? (
        <>
          <p
            id={outcomeId}
            ref={outcomeRef}
            tabIndex={-1}
            role="status"
            className="mt-3"
            style={{ color: "var(--ink)" }}
          >
            {state.message}
          </p>
          {state.shown ? (
            <p className="mt-3" style={{ color: "var(--ink)" }}>
              <span className="text-sm font-bold">Full address: </span>
              <span style={{ wordBreak: "break-word" }}>{state.shown}</span>
            </p>
          ) : null}
          <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
            Recorded against your account, word for word:
          </p>
          <p
            className="mt-1 text-sm"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink)" }}
          >
            {state.reason ?? ""}
          </p>
          <p className="mt-4">
            <button type="button" className="btn-ghost text-sm" onClick={close}>
              Close
            </button>
          </p>
        </>
      ) : (
        <form action={submit} className="mt-3 space-y-4">
          <input type="hidden" name="subjectId" defaultValue={subjectId} />

          <ul className="space-y-2 ps-5" style={{ color: "var(--ink)", listStyle: "disc" }}>
            {spec.consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <div>
            <label className="label" htmlFor={reasonId}>
              Why are you doing this?
            </label>
            <textarea
              className="input"
              id={reasonId}
              name="reason"
              rows={3}
              maxLength={REASON_MAX}
              ref={reasonRef}
              defaultValue={state.reason ?? ""}
              aria-invalid={refused && state.field === "reason" ? true : undefined}
              aria-describedby={`${helpId} ${outcomeId}`}
            />
            <p id={helpId} className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
              At least {REASON_MIN} characters. Saved permanently, word for word, next to your name
              and this record, and it can be read back later. Write what a colleague would need in
              order to understand why. Do not name a child.
            </p>
          </div>

          {/* Always in the DOM, so assistive technology is watching the region
              before a message arrives rather than meeting a node that has just
              appeared. */}
          <p
            id={outcomeId}
            role="alert"
            aria-live="assertive"
            style={{
              minHeight: "1.5rem",
              color: "var(--ink)",
              background: refused ? "var(--error-tint)" : "transparent",
              borderRadius: 10,
              padding: refused ? "0.5rem 0.75rem" : 0,
            }}
          >
            {refused ? state.message : ""}
          </p>

          <div className="flex flex-wrap gap-3">
            <button className="btn-brand" type="submit" aria-busy={pending || undefined}>
              {pending ? "Working…" : spec.confirmLabel}
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
