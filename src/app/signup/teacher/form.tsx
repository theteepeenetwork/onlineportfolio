"use client";

import { useActionState } from "react";
import { teacherSignup } from "@/app/actions/auth";

export function TeacherSignupForm() {
  const [state, action, pending] = useActionState(teacherSignup, {});

  return (
    <form action={action} className="mt-5 space-y-4">
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input className="input" id="name" name="name" autoComplete="name" placeholder="Sam Rivera" required />
      </div>
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
          autoComplete="new-password"
          minLength={6}
          placeholder="At least 6 characters"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="className">
          Your first class name <span className="font-normal text-muted">(optional)</span>
        </label>
        <input className="input" id="className" name="className" placeholder="e.g. Sunflower Class" />
        <p className="mt-1 text-xs text-muted">You can add more classes later.</p>
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}

      <button className="btn-brand w-full" type="submit" disabled={pending}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
    </form>
  );
}
