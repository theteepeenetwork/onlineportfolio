"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { opsLookupAdult, type OpsLookupState } from "@/app/actions/ops/lookup";
import { opsRevealParentEmail, opsRotateFamilyCode } from "@/app/actions/ops/operations";
import { ConfirmAction } from "../ConfirmAction";
import { LOOKUP_KIND_LABEL, MAIL_STATE_LABEL, REASON_MAX, REASON_MIN } from "@/lib/ops/dto";
import { OPS_OPERATIONS } from "@/lib/ops/registry";

// The lookup form and its result.
//
// THE REASON FIELD (handbook ruling R16), and the two easy ways to get it wrong
//
//   1. Disabling submit until the reason is long enough. A disabled control is
//      unfocusable, announces nothing, and hands a keyboard or screen reader
//      user a dead end with no stated cause. Submit here is NEVER disabled, not
//      for a short reason and not while the request is in flight; the button
//      says what is happening and aria-busy carries it to assistive technology.
//   2. Validating in the browser and trusting it. Everything is re-checked on
//      the server, which is the only half of this that an attacker cannot skip.
//      The browser's copy exists to save a round trip, and it is allowed to be
//      wrong.
//
// The helper text warns against naming a child. No gate can catch a child's
// name typed into a free text box, so this is a warning rather than a control,
// and the residual risk is the owner's to accept in writing.

const ERROR_ID = "ops-lookup-error";
const REASON_HELP_ID = "ops-lookup-reason-help";
const EMAIL_HELP_ID = "ops-lookup-email-help";

export function LookupForm() {
  const [state, action, pending] = useActionState(opsLookupAdult, {} as OpsLookupState);
  const emailRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // 3.3.1: an error that is announced but leaves focus at the bottom of the
  // page makes the person hunt for the field it is about.
  useEffect(() => {
    if (state.field === "email") emailRef.current?.focus();
    if (state.field === "reason") reasonRef.current?.focus();
  }, [state]);

  const values = state.values;

  return (
    <>
      <form action={action} className="mt-6 space-y-5">
        <fieldset>
          <legend className="label">Who are you looking for?</legend>
          {(["TEACHER", "PARENT"] as const).map((kind, i) => (
            <label
              key={kind}
              htmlFor={`kind-${kind}`}
              className="flex items-center gap-3"
              style={{ minHeight: 44, color: "var(--ink)" }}
            >
              <input
                type="radio"
                id={`kind-${kind}`}
                name="kind"
                value={kind}
                defaultChecked={values ? values.kind === kind : i === 0}
                style={{ width: 20, height: 20 }}
              />
              {LOOKUP_KIND_LABEL[kind]}
            </label>
          ))}
        </fieldset>

        <div>
          <label className="label" htmlFor="email">
            Their email address
          </label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            ref={emailRef}
            defaultValue={values?.email ?? ""}
            aria-invalid={state.field === "email" ? true : undefined}
            aria-describedby={`${EMAIL_HELP_ID} ${ERROR_ID}`}
          />
          <p id={EMAIL_HELP_ID} className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            The whole address, exactly. There is no way to search for part of one, and no way to
            browse the list, so you can only find an address somebody has already given you.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="reason">
            Why are you looking this up?
          </label>
          <textarea
            className="input"
            id="reason"
            name="reason"
            rows={3}
            maxLength={REASON_MAX}
            ref={reasonRef}
            defaultValue={values?.reason ?? ""}
            aria-invalid={state.field === "reason" ? true : undefined}
            aria-describedby={`${REASON_HELP_ID} ${ERROR_ID}`}
          />
          <p id={REASON_HELP_ID} className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            At least {REASON_MIN} characters. This is saved permanently, word for word, next to the
            address you searched for, and it can be read back later. Write what a colleague would
            need to understand the search. Do not name a child.
          </p>
        </div>

        {/* Always in the DOM, so assistive technology is already watching the
            region when a message arrives rather than meeting a node that has
            just appeared. */}
        <p
          id={ERROR_ID}
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: "1.5rem",
            color: "var(--ink)",
            background: state.error ? "var(--error-tint)" : "transparent",
            borderRadius: 10,
            padding: state.error ? "0.5rem 0.75rem" : 0,
          }}
        >
          {state.error ?? ""}
        </p>

        <button className="btn-brand" type="submit" aria-busy={pending || undefined}>
          {pending ? "Searching…" : "Search and record the reason"}
        </button>
      </form>

      <Result state={state} />
    </>
  );
}

function Result({ state }: { state: OpsLookupState }) {
  if (!("record" in state)) return null;
  const record = state.record;

  return (
    <section aria-labelledby="ops-lookup-result" className="mt-8">
      <h2 id="ops-lookup-result" className="font-display text-xl" style={{ color: "var(--ink)" }}>
        Result
      </h2>
      <div role="status" className="mt-3">
        {!record ? (
          // SAY WHICH TABLE WAS SEARCHED. The old wording was "No account has
          // that address", and it was false in the commonest way this screen is
          // used wrong: the form defaults to staff, a support call about a
          // family code is about a parent, and an operator who left the default
          // alone was told no account existed for an account that does. The
          // persona team hit exactly that and filed a major against the rotate
          // control for not being there — it had rendered for nobody, because
          // no parent had been found (F58).
          //
          // The narrower sentence also DISCLOSES LESS, which is why it is the
          // right one twice over: "no account has that address" is a claim about
          // every account in StoryJar, and this screen is only ever entitled to
          // answer for the one table it looked in.
          <p style={{ color: "var(--ink)" }}>
            No {state.kind === "PARENT" ? "parent or carer" : "member of school staff"} has that
            address. Nothing else was searched, and the search was recorded
            {state.kind === "PARENT"
              ? " — if they are staff, search again for a member of school staff."
              : " — if they are a parent or carer, search again for a parent or carer."}
          </p>
        ) : record.kind === "TEACHER" ? (
          <dl className="card grid gap-x-6 gap-y-1 p-5 sm:grid-cols-2">
            <Fact term="Name" value={record.name} />
            <Fact term="Email" value={record.email} />
            <Fact term="Position" value={record.positionLabel} />
            <Fact
              term="Account"
              value={record.status === "INVITED" ? "Invited, no password set yet" : "Active"}
            />
            <Fact term="School" value={record.schoolName ?? "Not attached to a school"} />
            <Fact term="Registered" value={record.createdAt} />
          </dl>
        ) : (
          <dl className="card grid gap-x-6 gap-y-1 p-5 sm:grid-cols-2">
            <Fact term="Email" value={record.maskedEmail} />
            <Fact term="Registered" value={record.createdAt} />
            <Fact term="Delivery" value={MAIL_STATE_LABEL[record.mailState]} />
          </dl>
        )}
      </div>

      {record?.kind === "PARENT" ? (
        <>
          <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
            The address is shown masked on purpose. Seeing one in full is a separate action that has
            to be asked for and recorded, below. Nothing here says which children this parent is
            linked to, or how many, and there is no way to ask.
          </p>

          {/* The two named operations, and the only two things this area can do
              to a record. Both hang off a record the operator has already found
              by typing somebody's whole address: neither has an address box of
              its own, so neither can be used to walk the table (amendment C4).
              The list they come from is src/lib/ops/registry.ts and it is
              closed. */}
          <ConfirmAction
            spec={OPS_OPERATIONS.OPS_PARENT_EMAIL_REVEALED}
            subjectId={record.id}
            action={opsRevealParentEmail}
          />
          <ConfirmAction
            spec={OPS_OPERATIONS.OPS_FAMILY_CODE_ROTATED}
            subjectId={record.id}
            action={opsRotateFamilyCode}
          />

          <p className="mt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
            There is nothing else that can be done to this record from here. An operator cannot
            change an adult&rsquo;s email address, in this area or anywhere else in StoryJar: a
            teacher changes their own, and a school admin re-invites them. Changing one here would
            be a way into that person&rsquo;s account.
          </p>
        </>
      ) : null}

      <div className="mt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
        <p>Reason saved, word for word:</p>
        <p
          className="mt-1"
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--ink)" }}
        >
          {state.values?.reason ?? ""}
        </p>
      </div>
    </section>
  );
}

// `value` rather than the obvious React prop name: the blindness gate refuses
// the identifier `children` anywhere under the ops roots, because on a Parent
// it is the linked-children relation ruling R11 bans. See src/app/ops/shell.tsx.
function Fact({ term, value }: { term: string; value: ReactNode }) {
  return (
    <div className="py-1">
      <dt className="text-sm font-bold" style={{ color: "var(--ink)" }}>
        {term}
      </dt>
      <dd style={{ color: "var(--ink)", wordBreak: "break-word" }}>{value}</dd>
    </div>
  );
}
