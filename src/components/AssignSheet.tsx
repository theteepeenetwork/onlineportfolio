"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { assignTemplate } from "@/app/actions/activities";
import { Avatar } from "@/components/Avatar";
import type { ClassInfo, RunSummary } from "@/lib/activities";

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(iso));
}

// The assign / reassign sheet. The same sheet serves a first assignment and a
// reassignment; each confirm creates a new independent run.
export function AssignSheet({
  template,
  classes,
  pastRuns,
  onClose,
}: {
  template: { id: string; title: string; thumb: string | null };
  classes: ClassInfo[];
  pastRuns: RunSummary[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(assignTemplate, {});
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [mode, setMode] = useState<"class" | "children">("class");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const klass = classes.find((c) => c.id === classId) ?? classes[0];
  const count = mode === "class" ? klass?.students.length ?? 0 : selected.size;
  const confirmLabel =
    mode === "class"
      ? "Assign to whole class"
      : selected.size === 0
        ? "Pick children to assign"
        : `Assign to ${selected.size} ${selected.size === 1 ? "child" : "children"}`;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8" onClick={onClose}>
      <form
        action={action}
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-md p-5"
      >
        <input type="hidden" name="templateId" value={template.id} />
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="mode" value={mode} />
        {mode === "children" &&
          [...selected].map((id) => <input key={id} type="hidden" name="studentIds" value={id} />)}

        <h2 className="text-lg font-bold">
          Assign <span className="text-brand">{template.title}</span>
        </h2>

        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-background/60 p-2">
          {template.thumb ? (
            <Image src={template.thumb} alt="" width={64} height={45} unoptimized className="h-11 w-16 rounded-md border border-border object-cover" />
          ) : (
            <div className="flex h-11 w-16 items-center justify-center rounded-md border border-border text-lg">📝</div>
          )}
          <span className="text-sm font-semibold text-muted">Blank response canvas or your template</span>
        </div>

        {/* Class */}
        <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Class</p>
        <div className="flex flex-wrap gap-2">
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { setClassId(c.id); setSelected(new Set()); }}
              className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold ${
                classId === c.id ? "border-brand bg-brand/10 text-brand" : "border-border text-muted"
              }`}
            >
              {classId === c.id ? "✓ " : ""}{c.name}
            </button>
          ))}
        </div>

        {/* Who */}
        <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Who</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("class")}
            className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold ${
              mode === "class" ? "border-brand bg-brand/10 text-brand" : "border-border text-muted"
            }`}
          >
            👥 Whole class
          </button>
          <button
            type="button"
            onClick={() => setMode("children")}
            className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold ${
              mode === "children" ? "border-brand bg-brand/10 text-brand" : "border-border text-muted"
            }`}
          >
            🙋 Pick children
          </button>
        </div>

        {mode === "children" && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {klass?.students.map((s) => {
              const on = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left ${on ? "border-brand bg-brand/10" : "border-border"}`}
                >
                  <Avatar name={s.name} color={s.avatarColor} size={28} />
                  <span className="truncate text-sm font-semibold">{s.name}</span>
                  {on && <span className="ml-auto text-brand">✓</span>}
                </button>
              );
            })}
            {klass?.students.length === 0 && <p className="text-sm text-muted">This class has no children yet.</p>}
          </div>
        )}

        {/* Already ran */}
        {pastRuns.length > 0 && (
          <>
            <p className="mt-4 mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Already ran</p>
            <ul className="space-y-1 text-sm text-muted">
              {pastRuns.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg bg-background/60 px-2.5 py-1.5">
                  <span className="font-semibold text-foreground">{r.className}</span>
                  <span>· {fmtDate(r.createdAt)}</span>
                  <span>· {r.turnedIn}/{r.assigned}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "LIVE" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                    {r.status === "LIVE" ? "live" : "closed"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {state?.error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={pending || count === 0} className="btn-green">
            {pending ? "Assigning…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
