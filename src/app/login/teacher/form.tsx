"use client";

import { useActionState } from "react";
import Link from "next/link";
import { teacherLogin } from "@/app/actions/auth";

// `next` is set only by the OAuth consent page, which sends a teacher here to
// sign in mid-connection. teacherLogin refuses any value that is not that one
// route, so this input cannot become an open redirect.
export function TeacherLoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(teacherLogin, {});

  return (
    <form action={action} className="mt-5 space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="email">
          Email
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
        />
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}

      <button className="btn-brand w-full" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>

      {/* The way out, where the failure happens. A reset flow reachable only
          from a help page is a reset flow a teacher rings the office about
          instead — and on a Monday morning the office is the point at which
          this stops being a software problem. */}
      <p className="pt-1 text-center text-sm">
        <Link href="/login/teacher/forgotten" className="font-bold text-brand hover:underline">
          Forgotten your password?
        </Link>
      </p>
    </form>
  );
}
