"use client";

import { useActionState, useEffect, useRef } from "react";
import { addStudent } from "@/app/actions/roster";

export function AddStudentForm({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState(addStudent, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box after a student is successfully added.
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="classId" value={classId} />
      <div className="flex-1 min-w-[12rem]">
        <label className="label" htmlFor="name">
          Add a student
        </label>
        <input
          id="name"
          name="name"
          className="input"
          placeholder="First name"
          autoComplete="off"
          required
        />
      </div>
      <button className="btn-brand" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-rose-700">{state.error}</p>
      )}
    </form>
  );
}
