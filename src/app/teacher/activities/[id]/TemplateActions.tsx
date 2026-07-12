"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AssignSheet } from "@/components/AssignSheet";
import { duplicateTemplate, setTemplateArchived } from "@/app/actions/activities";
import type { ClassInfo, RunSummary } from "@/lib/activities";

// The Assign / Edit / View-as-child / Duplicate / Archive controls on the
// template detail header.
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
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu when clicking anywhere outside it (and on Escape).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setAssigning(true)} className="btn-green">
        Assign ▸
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="btn-ghost px-3"
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
        {menuOpen && (
          <div role="menu" className="absolute right-0 top-full z-10 mt-1 w-44 rounded-xl border border-border bg-surface p-1 shadow-lg">
            <Link
              role="menuitem"
              href={`/teacher/activities/${template.id}/edit`}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-background"
            >
              Edit activity
            </Link>
            <Link
              role="menuitem"
              href={`/teacher/activities/${template.id}/preview`}
              className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-background"
            >
              View as a pupil
            </Link>
            <form action={duplicateTemplate}>
              <input type="hidden" name="templateId" value={template.id} />
              <button role="menuitem" type="submit" className="block w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-background">
                Duplicate
              </button>
            </form>
            <form action={setTemplateArchived}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="archived" value="true" />
              <button role="menuitem" type="submit" className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-muted hover:bg-background">
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
