"use client";

import { useActionState, useState } from "react";
import { createActivity } from "@/app/actions/activities";
import { DrawingCanvas } from "@/components/DrawingCanvas";
import { Avatar } from "@/components/Avatar";

type Student = { id: string; name: string; avatarColor: string };
type ClassInfo = { id: string; name: string; students: Student[] };

export function ActivityBuilder({ classes }: { classes: ClassInfo[] }) {
  const [state, action, pending] = useActionState(createActivity, {});
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [assignMode, setAssignMode] = useState<"all" | "some">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const klass = classes.find((c) => c.id === classId) ?? classes[0];

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="assignMode" value={assignMode} />
      {assignMode === "some" &&
        [...selected].map((id) => (
          <input key={id} type="hidden" name="studentIds" value={id} />
        ))}

      {/* Title + instructions */}
      <div className="card space-y-4 p-5">
        <div>
          <label className="label" htmlFor="title">
            Activity title
          </label>
          <input id="title" name="title" className="input" placeholder="e.g. Make 10 — part-whole model" required />
        </div>
        <div>
          <label className="label" htmlFor="instructions">
            Instructions (optional)
          </label>
          <textarea
            id="instructions"
            name="instructions"
            rows={3}
            className="input"
            placeholder="Tell the children what to do. Keep it short — you can read it aloud too."
          />
        </div>
      </div>

      {/* Template */}
      <div className="card p-5">
        <h2 className="text-lg font-bold">Template (optional)</h2>
        <p className="mb-3 text-sm text-muted">
          Draw a template the children work on top of, or add a PDF / picture (for
          example a worksheet). Leave it blank for a free response.
        </p>
        <DrawingCanvas name="templatePages" allowImport />
      </div>

      {/* Assign to */}
      <div className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Assign to</h2>

        {classes.length > 1 && (
          <div>
            <label className="label" htmlFor="classPick">
              Class
            </label>
            <select
              id="classPick"
              className="input"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSelected(new Set());
              }}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAssignMode("all")}
            className={`rounded-xl border-2 px-4 py-2 font-semibold ${
              assignMode === "all" ? "border-brand bg-brand/10 text-brand" : "border-border text-muted"
            }`}
          >
            👥 Whole class
          </button>
          <button
            type="button"
            onClick={() => setAssignMode("some")}
            className={`rounded-xl border-2 px-4 py-2 font-semibold ${
              assignMode === "some" ? "border-brand bg-brand/10 text-brand" : "border-border text-muted"
            }`}
          >
            🙋 Choose children
          </button>
        </div>

        {assignMode === "some" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {klass?.students.map((s) => {
              const on = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left ${
                    on ? "border-brand bg-brand/10" : "border-border"
                  }`}
                >
                  <Avatar name={s.name} color={s.avatarColor} size={32} />
                  <span className="truncate text-sm font-semibold">{s.name}</span>
                  {on && <span className="ml-auto text-brand">✓</span>}
                </button>
              );
            })}
            {klass?.students.length === 0 && (
              <p className="text-sm text-muted">This class has no children yet.</p>
            )}
          </div>
        )}
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-brand w-full py-3 text-lg">
        {pending ? "Saving…" : "Save & assign activity"}
      </button>
    </form>
  );
}
