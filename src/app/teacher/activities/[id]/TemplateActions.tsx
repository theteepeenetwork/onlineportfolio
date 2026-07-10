"use client";

import { useState } from "react";
import { AssignSheet } from "@/components/AssignSheet";
import { duplicateTemplate, setTemplateArchived } from "@/app/actions/activities";
import type { ClassInfo, RunSummary } from "@/lib/activities";

// The Assign / Duplicate / Archive controls on the template detail header.
export function TemplateActions({
  template,
  classes,
  pastRuns,
}: {
  template: { id: string; title: string; thumb: string | null };
  classes: ClassInfo[];
  pastRuns: RunSummary[];
}) {
  const [assigning, setAssigning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setAssigning(true)} className="btn-green">
        Assign ▸
      </button>
      <div className="relative">
        <button type="button" onClick={() => setMenuOpen((v) => !v)} className="btn-ghost px-3" aria-label="More">
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-border bg-surface p-1 shadow-lg">
            <form action={duplicateTemplate}>
              <input type="hidden" name="templateId" value={template.id} />
              <button type="submit" className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-background">
                Duplicate
              </button>
            </form>
            <form action={setTemplateArchived}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="archived" value="true" />
              <button type="submit" className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:bg-background">
                Archive
              </button>
            </form>
          </div>
        )}
      </div>

      {assigning && (
        <AssignSheet template={template} classes={classes} pastRuns={pastRuns} onClose={() => setAssigning(false)} />
      )}
    </div>
  );
}
