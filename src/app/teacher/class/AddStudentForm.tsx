"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addStudents } from "@/app/actions/roster";

export function AddStudentForm({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState(addStudents, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState("");
  // Each class has its own form on the page, so the field needs a unique id
  // (duplicate ids would break the label/textarea association).
  const fieldId = `names-${classId}`;

  // Clear the box after students are successfully added.
  useEffect(() => {
    if (!pending && !state.error && state.added) {
      formRef.current?.reset();
      setValue("");
    }
  }, [pending, state]);

  // How many names are typed/pasted so far — drives the button label. Mirror
  // the server: split on lines/commas, drop blanks and case-insensitive repeats.
  const count = new Set(
    value
      .split(/[\n,]+/)
      .map((n) => n.trim().toLowerCase())
      .filter(Boolean),
  ).size;

  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="classId" value={classId} />
      <div>
        <label className="label" htmlFor={fieldId}>
          Add students
        </label>
        <textarea
          id={fieldId}
          name="names"
          className="input min-h-[2.75rem] resize-y"
          rows={1}
          placeholder="Type a name, or paste a whole class list — one name per line"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onInput={(e) => {
            // Grow to fit a pasted list, up to a sensible height.
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
          }}
        />
        <p className="mt-1 text-xs text-muted">
          Paste from a register or spreadsheet — one name per line, or separated by commas.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-brand" type="submit" disabled={pending || count === 0}>
          {pending
            ? "Adding…"
            : count > 1
              ? `Add ${count} students`
              : "Add student"}
        </button>
        {state.error && <p className="text-sm text-rose-700">{state.error}</p>}
      </div>
    </form>
  );
}
