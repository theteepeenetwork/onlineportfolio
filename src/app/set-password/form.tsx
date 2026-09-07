"use client";

import { useActionState } from "react";
import Link from "next/link";
import { setPassword } from "@/app/actions/password";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordTokenPolicy";

// The set-password form. ONE form for both a reset and a staff invitation,
// because the job is the same one: this person holds a single-use token and is
// choosing a password. The heading above it differs; this does not.
export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setPassword, {});

  return (
    <form action={action} className="mt-5 space-y-4 text-left">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <p className="mt-1 text-[13px] text-muted">
          At least {MIN_PASSWORD_LENGTH} characters. A few words you&rsquo;ll remember beats
          something clever you won&rsquo;t.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Type it again
        </label>
        <input
          className="input"
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>

      {state?.error && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <p>{state.error}</p>
          {/* Every refusal — unknown, expired, already used — says the same
              thing and offers the same way forward, because distinguishing them
              would tell somebody holding a stale link whether it was ever real.
              The way forward matters: this is a teacher on a Monday morning who
              clicked yesterday's email. */}
          <p className="mt-2">
            <Link href="/login/teacher/forgotten" className="font-bold underline">
              Send me a new link
            </Link>
          </p>
        </div>
      )}

      <button className="btn-brand w-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save and sign in"}
      </button>
    </form>
  );
}
