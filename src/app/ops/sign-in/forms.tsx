"use client";

import { useActionState } from "react";
import { opsConfirmEnrolment, opsSignIn, opsSubmitCode, type OpsFormState } from "@/app/actions/ops/auth";

// The three states of the door, as forms. Accessibility here is this role's own
// work (handbook ruling R15), built to an EMPTY axe baseline, and three of the
// requirements are easy to get wrong by being helpful:
//
//   3.3.8 Accessible Authentication. Paste is NOT blocked, autofill is NOT
//   disabled, and the fields carry the right autocomplete values
//   ("current-password", "one-time-code"). A field that rejects a paste from a
//   password manager is a cognitive function test in all but name, and there is
//   no onPaste handler anywhere in this file for exactly that reason.
//
//   3.3.1 / 3.3.3 Error identification. The single generic failure string has
//   to coexist with a properly announced error: the message is identical for
//   every cause, and it is in a live region tied to the field with
//   aria-describedby and aria-invalid, so it is never conveyed by colour or
//   position alone.
//
//   2.2.1 Timing Adjustable. Both time limits are stated in the copy before
//   they bite. They are not adjustable, which 2.2.1 allows only under its
//   essential exception, and a sign-in step for the account that can reach
//   every school's billing state is squarely inside it. What the copy has to do
//   instead is make the recovery obvious and cheap: say what expires, say when,
//   and say that nothing is lost when it does.

const CODE_HELP_ID = "ops-code-help";
const ERROR_ID = "ops-error";

function ErrorNote({ state }: { state: OpsFormState }) {
  // Always rendered, so assistive technology is already watching the region
  // when the message arrives rather than meeting a node that has just appeared.
  return (
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
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(opsSignIn, {} as OpsFormState);
  return (
    <form action={action} className="mt-5 space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={ERROR_ID}
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={ERROR_ID}
        />
      </div>
      <ErrorNote state={state} />
      <button className="btn-brand w-full" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}

function CodeField({ state, label }: { state: OpsFormState; label: string }) {
  return (
    <div>
      <label className="label" htmlFor="code">
        {label}
      </label>
      <input
        className="input"
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        required
        aria-invalid={state.error ? true : undefined}
        aria-describedby={`${CODE_HELP_ID} ${ERROR_ID}`}
      />
    </div>
  );
}

export function CodeForm({
  codeSeconds,
  doorMinutes,
  recoveryCodesLeft,
}: {
  codeSeconds: number;
  doorMinutes: number;
  recoveryCodesLeft: number;
}) {
  const [state, action, pending] = useActionState(opsSubmitCode, {} as OpsFormState);
  return (
    <form action={action} className="mt-5 space-y-4">
      <CodeField state={state} label="6-digit code from your authenticator app" />
      <p id={CODE_HELP_ID} className="text-sm" style={{ color: "var(--ink-soft)" }}>
        The code changes every {codeSeconds} seconds. If it changes while you are typing, enter the new
        one. This step stops working {doorMinutes} minutes after your password: if that happens, enter
        your email and password again and start the {codeSeconds}-second code afresh. Nothing is lost.
        You can use one of your printed recovery codes here instead ({recoveryCodesLeft} unused). Each
        one works once.
      </p>
      <ErrorNote state={state} />
      <button className="btn-brand w-full" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

export function EnrolmentForm({
  email,
  secretForTyping,
  enrolmentUri,
  codeSeconds,
  doorMinutes,
}: {
  email: string;
  secretForTyping: string;
  enrolmentUri: string;
  codeSeconds: number;
  doorMinutes: number;
}) {
  const [state, action, pending] = useActionState(opsConfirmEnrolment, {} as OpsFormState);
  return (
    <div className="mt-5">
      <h2 className="font-display text-lg" style={{ color: "var(--ink)" }}>
        Set up your authenticator
      </h2>
      <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>
        Add this account to an authenticator app, then type the code it shows. There is deliberately no
        QR image on this page: nothing under this part of the site renders an image of any kind, so that
        no screen here can ever display a child&rsquo;s photograph.
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        <dt className="font-bold" style={{ color: "var(--ink)" }}>
          Account
        </dt>
        <dd style={{ color: "var(--ink)" }}>{email}</dd>
        <dt className="font-bold" style={{ color: "var(--ink)" }}>
          Setup key
        </dt>
        <dd>
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              wordBreak: "break-all",
              color: "var(--ink)",
            }}
          >
            {secretForTyping}
          </span>
        </dd>
        <dt className="font-bold" style={{ color: "var(--ink)" }}>
          Or paste this into the app
        </dt>
        <dd>
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              wordBreak: "break-all",
              color: "var(--ink)",
            }}
          >
            {enrolmentUri}
          </span>
        </dd>
      </dl>
      <form action={action} className="mt-4 space-y-4">
        <CodeField state={state} label="Code from the app, to confirm the setup" />
        <p id={CODE_HELP_ID} className="text-sm" style={{ color: "var(--ink-soft)" }}>
          The code changes every {codeSeconds} seconds. This setup step stops working {doorMinutes}{" "}
          minutes after your password: if that happens, sign in again and the setup key above is
          unchanged. Your recovery codes were printed when the account was created; keep them offline.
        </p>
        <ErrorNote state={state} />
        <button className="btn-brand w-full" type="submit" disabled={pending}>
          {pending ? "Checking…" : "Confirm"}
        </button>
      </form>
    </div>
  );
}
