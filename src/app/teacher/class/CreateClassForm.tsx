"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClass } from "@/app/actions/classes";

export function CreateClassForm() {
  const [state, action, pending] = useActionState(createClass, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Clear the box after a class is created.
  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[14rem] flex-1">
        <label className="label" htmlFor="className">
          Class name
        </label>
        <input
          id="className"
          name="name"
          className="input"
          placeholder="e.g. Bluebell Class"
          autoComplete="off"
          required
        />
      </div>
      <button className="btn-brand" type="submit" disabled={pending}>
        {pending ? "Creating…" : "＋ Create class"}
      </button>
      {state.error && <p className="w-full text-sm text-rose-700">{state.error}</p>}
    </form>
  );
}
