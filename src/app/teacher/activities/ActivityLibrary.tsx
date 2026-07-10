"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AssignSheet } from "@/components/AssignSheet";
import { duplicateTemplate, setTemplateArchived } from "@/app/actions/activities";
import type { ClassInfo, RunSummary } from "@/lib/activities";

export type TemplateSummary = {
  id: string;
  title: string;
  instructions: string;
  tags: string[];
  thumb: string | null;
  liveClassNames: string[];
  runCount: number;
  waiting: number;
  neverRun: boolean;
  pastRuns: RunSummary[];
};

export type NeedsAttention = { templateId: string; title: string; className: string; waiting: number };

function statusChip(t: TemplateSummary) {
  if (t.liveClassNames.length === 1)
    return { text: `live · ${t.liveClassNames[0]}`, live: true };
  if (t.liveClassNames.length > 1)
    return { text: `live · ${t.liveClassNames.length} classes`, live: true };
  if (t.runCount > 0) return { text: `${t.runCount} past run${t.runCount === 1 ? "" : "s"}`, live: false };
  return { text: "never run", live: false };
}

export function ActivityLibrary({
  templates,
  classes,
  needsAttention,
  allTags,
}: {
  templates: TemplateSummary[];
  classes: ClassInfo[];
  needsAttention: NeedsAttention[];
  allTags: string[];
}) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | "live" | "never">("all");
  const [assignId, setAssignId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = templates.filter((t) => {
    if (q && !`${t.title} ${t.instructions}`.toLowerCase().includes(q)) return false;
    if (tag && !t.tags.includes(tag)) return false;
    if (status === "live" && t.liveClassNames.length === 0) return false;
    if (status === "never" && !t.neverRun) return false;
    return true;
  });

  const assignTemplate = templates.find((t) => t.id === assignId);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          className="input max-w-xs"
          placeholder="🔍 Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Link href="/teacher/activities/new" className="btn-brand ml-auto">
          ＋ New template
        </Link>
      </div>

      {/* Filter chips */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Chip active={tag === null && status === "all"} onClick={() => { setTag(null); setStatus("all"); }}>
          All
        </Chip>
        {allTags.map((tg) => (
          <Chip key={tg} active={tag === tg} onClick={() => setTag(tag === tg ? null : tg)}>
            {tg}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <Chip active={status === "live"} tone="green" onClick={() => setStatus(status === "live" ? "all" : "live")}>
          Live now
        </Chip>
        <Chip active={status === "never"} onClick={() => setStatus(status === "never" ? "all" : "never")}>
          Never run
        </Chip>
      </div>

      {/* Needs attention */}
      {needsAttention.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Needs attention</p>
          {needsAttention.map((n, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5">
              <span className="text-lg">🐛</span>
              <span className="font-semibold">
                {n.title} · {n.className}
              </span>
              <span className="text-sm text-amber-800">
                — {n.waiting} response{n.waiting === 1 ? "" : "s"} waiting
              </span>
              <Link href="/teacher/queue" className="btn-brand ml-auto px-3 py-1.5 text-sm">
                Review ▸
              </Link>
            </div>
          ))}
        </div>
      )}

      {templates.length === 0 && (
        <div className="card p-10 text-center">
          <div className="text-4xl">📚</div>
          <p className="mt-2 font-semibold">No templates yet</p>
          <p className="text-sm text-muted">Create a reusable template to assign to your classes.</p>
          <Link href="/teacher/activities/new" className="btn-brand mt-4">＋ New template</Link>
        </div>
      )}

      {templates.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const chip = statusChip(t);
            return (
              <div key={t.id} className="card relative flex flex-col overflow-hidden">
                <Link href={`/teacher/activities/${t.id}`} className="block bg-black/5">
                  {t.thumb ? (
                    <Image src={t.thumb} alt="" width={320} height={180} unoptimized className="aspect-[16/9] w-full object-contain" />
                  ) : (
                    <div className="flex aspect-[16/9] w-full items-center justify-center text-3xl text-muted">📝</div>
                  )}
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <Link href={`/teacher/activities/${t.id}`} className="font-bold hover:text-brand">
                    {t.title}
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {t.tags.map((tg) => (
                      <span key={tg} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                        {tg}
                      </span>
                    ))}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        chip.live ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {chip.live ? "● " : ""}
                      {chip.text}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 pt-1">
                    <button type="button" onClick={() => setAssignId(t.id)} className="btn-brand flex-1 py-1.5 text-sm">
                      Assign ▸
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuId(menuId === t.id ? null : t.id)}
                        className="btn-ghost px-2.5 py-1.5 text-sm"
                        aria-label="More"
                      >
                        ⋯
                      </button>
                      {menuId === t.id && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-border bg-surface p-1 shadow-lg">
                          <form action={duplicateTemplate}>
                            <input type="hidden" name="templateId" value={t.id} />
                            <button type="submit" className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-background">
                              Duplicate
                            </button>
                          </form>
                          <form action={setTemplateArchived}>
                            <input type="hidden" name="templateId" value={t.id} />
                            <input type="hidden" name="archived" value="true" />
                            <button type="submit" className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:bg-background">
                              Archive
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* New template tile */}
          <Link
            href="/teacher/activities/new"
            className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border text-muted transition-colors hover:border-brand hover:text-brand"
          >
            <span className="text-3xl">＋</span>
            <span className="mt-1 font-semibold">New template</span>
            <span className="text-xs">draw · upload · blank</span>
          </Link>
        </div>
      )}

      {assignTemplate && (
        <AssignSheet
          template={{ id: assignTemplate.id, title: assignTemplate.title, thumb: assignTemplate.thumb }}
          classes={classes}
          pastRuns={assignTemplate.pastRuns}
          onClose={() => setAssignId(null)}
        />
      )}
    </>
  );
}

function Chip({
  children,
  active,
  tone,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  tone?: "green";
  onClick: () => void;
}) {
  const activeCls = tone === "green" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-brand bg-brand/10 text-brand";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm font-semibold ${active ? activeCls : "border-border text-muted hover:bg-background"}`}
    >
      {children}
    </button>
  );
}
