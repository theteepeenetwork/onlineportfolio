"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/password";

// The request half of a password reset.
//
// THE RESPONSE IS THE SAME WHATEVER HAPPENED, and the copy has to carry that
// honestly rather than implying more than StoryJar knows. "If that address is
// on our system" is doing real work: this form is public, school staff lists are
// published on school websites, and a message that distinguished a known
// address from an unknown one would confirm which of a named school's staff use
// StoryJar (FINDINGS F6).
//
// It also has to be a message a teacher who typed their address correctly can
// act on, because they are the common case and they are in a hurry.
export function ForgottenPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, {});

  if (state?.sent) {
    return (
      <div className="mt-5 text-left">
        <p className="rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
          If that address is on our system, a link to set a new password is on its way. It works
          once, and for the next 30 minutes.
        </p>
        <p className="mt-3 text-sm text-muted">
          Nothing yet? Check your junk folder. Some schools filter mail from outside, so if it
          hasn&rsquo;t arrived in a few minutes your office may need to let StoryJar through.
        </p>
        {/* Development only. `signInLinkMayBeShown()` decides, in the action —
            this component never sees a URL in production (FINDINGS F19). */}
        {state.openUrl ? (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Development only —{" "}
            <a className="font-bold underline" href={state.openUrl}>
              open the link now
            </a>
          </p>
        ) : null}
        <p className="mt-5 text-sm text-muted">
          <Link href="/login/teacher" className="font-bold text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-4 text-left">
      <div>
        <label className="label" htmlFor="email">
          Your school email
        </label>
        <input
          className="input"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@school.uk"
          required
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}

      <button className="btn-brand w-full" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send me a link"}
      </button>

      <p className="pt-1 text-center text-sm text-muted">
        <Link href="/login/teacher" className="font-bold text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
