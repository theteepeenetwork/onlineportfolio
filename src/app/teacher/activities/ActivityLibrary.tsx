"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { AssignSheet } from "@/components/AssignSheet";
import {
  createFolder,
  duplicateTemplate,
  moveTemplateToFolder,
  setTemplateArchived,
} from "@/app/actions/activities";
import type { ClassInfo, RunSummary } from "@/lib/activities";
import { Icon, type IconName } from "@/components/icons/Icon";
import { ActivitySearchBox } from "@/components/ActivitySearchBox";
import { matchesActivitySearch, searchResultLabel } from "@/lib/activitySearch";

export type TemplateSummary = {
  id: string;
  title: string;
  instructions: string;
  tags: string[];
  thumb: string | null;
  archived: boolean;
  folderId: string | null;
  liveClassNames: string[];
  sentClasses: number;
  waiting: number;
  neverRun: boolean;
  pastRuns: RunSummary[];
};

export type FolderInfo = { id: string; name: string; color: string };

const ALL = "all";
const ARCHIVED = "archived";

// Icon + tint for a card's type tile, derived from whether it carries a
// worksheet/drawing background.
function typeMeta(t: TemplateSummary): { icon: IconName; bg: string; label: string } {
  if (t.thumb) return { icon: "draw", bg: "#FBEED3", label: "Drawing / worksheet" };
  if (t.instructions) return { icon: "write", bg: "#F7E0E6", label: "Prompt" };
  return { icon: "palette", bg: "#E5EED9", label: "Free choice" };
}

export function ActivityLibrary({
  templates,
  classes,
  folders,
}: {
  templates: TemplateSummary[];
  classes: ClassInfo[];
  folders: FolderInfo[];
}) {
  const [folder, setFolder] = useState<string>(ALL);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null); // which card's "move to folder" submenu is open
  const [assignId, setAssignId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [query, setQuery] = useState("");

  const closeMenus = () => {
    setMenuId(null);
    setMoveId(null);
  };

  const countFor = (id: string) => {
    if (id === ALL) return templates.filter((t) => !t.archived).length;
    if (id === ARCHIVED) return templates.filter((t) => t.archived).length;
    return templates.filter((t) => !t.archived && t.folderId === id).length;
  };

  const folderChips: (FolderInfo & { special?: boolean })[] = [
    { id: ALL, name: "All activities", color: "#C9C2B0", special: true },
    ...folders,
    { id: ARCHIVED, name: "Archived", color: "#B99CD6", special: true },
  ];

  // The folder chip decides WHICH of the teacher's activities are in play; the
  // search narrows that, never widens it. A search that reached across folders,
  // or into the archive, would quietly undo the choice they just made.
  const inFolder = templates.filter((t) => {
    if (folder === ALL) return !t.archived;
    if (folder === ARCHIVED) return t.archived;
    return !t.archived && t.folderId === folder;
  });
  const shown = inFolder.filter((t) => matchesActivitySearch(t, query));

  const folderName = folderChips.find((f) => f.id === folder)?.name ?? "All activities";
  const assignTemplate = templates.find((t) => t.id === assignId);

  return (
    // Clicking anywhere outside an open menu closes it (the backdrop-close rule).
    <div onClick={closeMenus} style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)" }}>{folderName}</h1>
          <p style={{ margin: "5px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            {inFolder.length === 0 ? "Nothing here yet" : searchResultLabel(shown.length, inFolder.length, query)}
          </p>
        </div>
        {inFolder.length > 0 && (
          <ActivitySearchBox
            id="my-activities-search"
            value={query}
            onChange={setQuery}
            label={`Search ${folderName.toLowerCase()}`}
            placeholder="title, instructions or a tag"
            resultLabel={searchResultLabel(shown.length, inFolder.length, query)}
          />
        )}
        <Link
          href="/teacher/activities/new"
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", textDecoration: "none", borderRadius: 999, padding: "12px 24px", minHeight: 48, boxSizing: "border-box", boxShadow: "0 3px 0 var(--jam-deep)" }}
        >
          ＋ New activity
        </Link>
      </div>

      {/* ══ folders, as a row ══
          The global rail already owns the left edge of every teacher screen, so
          a second vertical list beside it would be two sidebars arguing. The
          folders read the same way lying down. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderBottom: "2px solid var(--calm-border)", paddingBottom: 16, marginBottom: 20 }}>
        {folderChips.map((f) => {
          const active = folder === f.id;
          return (
            <button
              key={f.id}
              onClick={() => { setFolder(f.id); closeMenus(); }}
              aria-pressed={active}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
                font: "700 14px var(--font-atkinson)", color: "var(--ink)",
                background: active ? "var(--kraft-tag)" : "var(--cream)",
                border: `2px solid ${active ? "var(--ink)" : "var(--calm-border)"}`,
                borderRadius: 999, padding: "9px 15px", minHeight: 42, boxSizing: "border-box",
              }}
            >
              <span aria-hidden style={{ width: 12, height: 12, borderRadius: 4, background: f.color, border: "2px solid var(--ink)", flexShrink: 0 }} />
              <span>{f.name}</span>
              <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>{countFor(f.id)}</span>
            </button>
          );
        })}

        {creatingFolder ? (
          <NewFolderForm onDone={() => setCreatingFolder(false)} />
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", font: "700 14px var(--font-atkinson)", color: "var(--ink-soft)", background: "none", border: "2px dashed #C9C2B0", borderRadius: 999, padding: "9px 15px", minHeight: 42, boxSizing: "border-box" }}
          >
            ＋ New folder
          </button>
        )}

        {/* The StoryJar library is NOT a folder, and is deliberately not in the
            row above. It holds nothing of this teacher's, nothing in it is
            counted in their totals, and sitting it among the folders would say
            the opposite. It keeps its distance at the far end. */}
        <Link
          href="/teacher/activities/shared"
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", font: "700 14px var(--font-atkinson)", color: "var(--ink)", background: "var(--glass-light)", border: "2px solid var(--ink)", borderRadius: 999, padding: "9px 16px", minHeight: 42, boxSizing: "border-box" }}
        >
          StoryJar library <span aria-hidden>→</span>
        </Link>
      </div>

      {inFolder.length > 0 && shown.length === 0 ? (
        <div className="sj-card" style={{ padding: "48px 32px", textAlign: "center" }}>
          <p style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Nothing matches that</p>
          <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            Try a shorter word, or clear the search to see all {inFolder.length}.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="sj-card" style={{ padding: "48px 32px", textAlign: "center" }}>
          <Icon name="add-file" size={44} decorative />
          <p style={{ margin: "10px 0 0", font: "600 20px var(--font-fredoka)" }}>Nothing here yet</p>
          {templates.length === 0 ? (
            // A teacher who has nothing at all is the reason the library
            // exists. An empty grid tells them the product does nothing; this
            // tells them what it can do, and is one tap from proving it.
            <>
              <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                Have a look at the activities we have made. Add one and it is yours to change.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 18 }}>
                <Link
                  href="/teacher/activities/shared"
                  style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", textDecoration: "none", borderRadius: 999, padding: "12px 24px", boxShadow: "0 3px 0 var(--jam-deep)" }}
                >
                  Browse the StoryJar library
                </Link>
                <Link
                  href="/teacher/activities/new"
                  style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink)", textDecoration: "none", border: "2px solid var(--ink)", borderRadius: 999, padding: "12px 24px" }}
                >
                  Make my own
                </Link>
              </div>
            </>
          ) : (
            <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>Make a reusable activity to assign to your classes.</p>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {shown.map((t) => {
            const tm = typeMeta(t);
            const open = menuId === t.id;
            const state = statusOf(t);
            return (
              <div
                key={t.id}
                style={{ position: "relative", zIndex: open ? 20 : 1, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, boxShadow: "var(--pop-shadow)", display: "flex", flexDirection: "column" }}
              >
                {/* head band — the worksheet itself when there is one, else the
                    type's tint and glyph. */}
                <span
                  aria-hidden
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 96, borderBottom: "3px solid var(--ink)", borderRadius: "15px 15px 0 0", background: tm.bg, overflow: "hidden" }}
                >
                  {t.thumb ? (
                    // `contain`, not `cover`: this is a worksheet, and a crop
                    // that beheads the picture the teacher drew is worse than
                    // a little tint showing round the edges.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6, boxSizing: "border-box" }} />
                  ) : (
                    <Icon name={tm.icon} size={32} decorative />
                  )}
                </span>

                <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Link href={`/teacher/activities/${t.id}`} style={{ flex: 1, minWidth: 0, font: "600 18px/1.25 var(--font-fredoka)", color: "var(--ink)", textDecoration: "none" }}>{t.title}</Link>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMoveId(null); setMenuId(open ? null : t.id); }}
                      aria-label={`More actions for ${t.title}`}
                      aria-expanded={open}
                      style={{ flex: "none", width: 34, height: 34, borderRadius: 10, border: "none", background: open ? "var(--kraft-tag)" : "transparent", color: "var(--sj-muted)", font: "700 17px var(--font-atkinson)", cursor: "pointer", lineHeight: 1 }}
                    >
                      ⋯
                    </button>

                    {/* dropdown — sits ABOVE the cards (open card z-raised) */}
                    {open && (
                      <div
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: "absolute", top: 110, right: 14, width: 208, background: "var(--cream)", border: "2px solid var(--ink)", borderRadius: 12, padding: 6, boxShadow: "0 12px 30px rgba(34,48,74,0.28)", zIndex: 40 }}
                      >
                        {moveId === t.id ? (
                          <MoveMenu template={t} folders={folders} onBack={() => setMoveId(null)} />
                        ) : (
                          <>
                            <MenuLink href={`/teacher/activities/${t.id}/edit`} icon="edit" label="Edit activity" />
                            <MenuLink href={`/teacher/activities/${t.id}/preview`} icon="search" label="View as a pupil" />
                            <MenuForm action={duplicateTemplate} templateId={t.id} icon="add-file" label="Duplicate" />
                            <MenuButton icon="next" label="Move to folder…" onClick={() => setMoveId(t.id)} />
                            <MenuButton icon="share" label="Send to a class" onClick={() => { setAssignId(t.id); closeMenus(); }} />
                            {t.archived ? (
                              <MenuForm action={setTemplateArchived} templateId={t.id} archived="false" icon="undo" label="Restore" />
                            ) : (
                              <MenuForm action={setTemplateArchived} templateId={t.id} archived="true" icon="delete" label="Archive" danger />
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {t.instructions && (
                    <p style={{ margin: 0, font: "400 14px/1.5 var(--font-atkinson)", color: "var(--sj-muted)" }}>{t.instructions}</p>
                  )}

                  {t.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {t.tags.map((sk) => (
                        <span key={sk} style={{ font: "600 12px var(--font-atkinson)", color: "var(--ink-soft)", background: "var(--kraft-tag)", borderRadius: 999, padding: "3px 10px" }}>{sk}</span>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ font: "600 13px var(--font-atkinson)", color: state.color }}>{state.label}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAssignId(t.id); closeMenus(); }}
                      style={{ marginLeft: "auto", font: "700 14px var(--font-atkinson)", color: "var(--ink)", background: "var(--cream)", border: "2px solid var(--ink)", borderRadius: 999, padding: "8px 15px", minHeight: 40, boxSizing: "border-box", cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      Set for a class
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
    </div>
  );
}

// Where a template stands right now, in the teacher's words and the palette's
// state colours: teal for live, honey for work waiting on them, muted for
// anything finished or filed away.
function statusOf(t: TemplateSummary): { label: string; color: string } {
  if (t.archived) return { label: "Archived", color: "var(--sj-muted)" };
  if (t.waiting > 0) return { label: `${t.waiting} waiting to approve`, color: "var(--honey-ink)" };
  if (t.liveClassNames.length > 0) {
    return { label: `Live in ${t.liveClassNames.length} class${t.liveClassNames.length === 1 ? "" : "es"}`, color: "var(--glass-ink)" };
  }
  if (t.sentClasses > 0) return { label: `Sent to ${t.sentClasses} class${t.sentClasses === 1 ? "" : "es"}`, color: "var(--sj-muted)" };
  return { label: "Not sent to a class yet", color: "var(--sj-muted)" };
}

// ── menu building blocks ──
const MENU_ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
  font: "700 15px var(--font-atkinson)",
  background: "none",
  border: "none",
  borderRadius: 8,
  padding: "9px 12px",
  color: "var(--ink)",
  textDecoration: "none",
};

function MenuIcon({ icon }: { icon: IconName }) {
  return <Icon name={icon} size={18} decorative />;
}

function MenuLink({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link role="menuitem" href={href} style={MENU_ITEM}>
      <MenuIcon icon={icon} />
      {label}
    </Link>
  );
}

function MenuButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={onClick} style={MENU_ITEM}>
      <MenuIcon icon={icon} />
      {label}
    </button>
  );
}

function MenuForm({
  action,
  templateId,
  archived,
  icon,
  label,
  danger,
}: {
  action: (formData: FormData) => void;
  templateId: string;
  archived?: string;
  icon: IconName;
  label: string;
  danger?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="templateId" value={templateId} />
      {archived !== undefined && <input type="hidden" name="archived" value={archived} />}
      <button role="menuitem" type="submit" style={{ ...MENU_ITEM, color: danger ? "var(--jam)" : "var(--ink)" }}>
        <MenuIcon icon={icon} />
        {label}
      </button>
    </form>
  );
}

// The second level of the ⋯ menu: choose a destination folder.
function MoveMenu({ template, folders, onBack }: { template: TemplateSummary; folders: FolderInfo[]; onBack: () => void }) {
  return (
    <>
      <button onClick={onBack} style={{ ...MENU_ITEM, color: "var(--ink-soft)", font: "700 13px var(--font-atkinson)" }}>← Move to folder</button>
      <div style={{ height: 1, background: "#F0EADD", margin: "4px 0" }} />
      {folders.length === 0 && (
        <p style={{ margin: 0, padding: "9px 12px", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>No folders yet — make one first.</p>
      )}
      {folders.map((f) => (
        <form key={f.id} action={moveTemplateToFolder}>
          <input type="hidden" name="templateId" value={template.id} />
          <input type="hidden" name="folderId" value={f.id} />
          <button role="menuitem" type="submit" style={{ ...MENU_ITEM, opacity: template.folderId === f.id ? 0.5 : 1 }} disabled={template.folderId === f.id}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: f.color, border: "2px solid var(--ink)" }} />
            {f.name}
          </button>
        </form>
      ))}
      {template.folderId && (
        <form action={moveTemplateToFolder}>
          <input type="hidden" name="templateId" value={template.id} />
          <input type="hidden" name="folderId" value="" />
          <button role="menuitem" type="submit" style={{ ...MENU_ITEM, color: "var(--ink-soft)" }}>
            <MenuIcon icon="close" />
            Remove from folder
          </button>
        </form>
      )}
    </>
  );
}

function NewFolderForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createFolder, {});
  const ref = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      ref.current?.reset();
      onDone();
    }
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form ref={ref} action={action} onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input
        name="name"
        autoFocus
        aria-label="Folder name"
        placeholder="Folder name"
        required
        style={{ font: "400 14px var(--font-atkinson)", padding: "9px 14px", minHeight: 42, boxSizing: "border-box", width: 170, border: "2px solid var(--ink)", borderRadius: 999, background: "var(--paper)", color: "var(--ink)" }}
      />
      <button type="submit" disabled={pending} style={{ font: "700 14px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "none", borderRadius: 999, padding: "9px 18px", minHeight: 42, boxSizing: "border-box", cursor: "pointer" }}>{pending ? "…" : "Create"}</button>
      <button type="button" onClick={onDone} style={{ font: "700 14px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "none", minHeight: 42, cursor: "pointer" }}>Cancel</button>
      {state.error && <p role="alert" style={{ margin: 0, font: "700 13px var(--font-atkinson)", color: "var(--jam)" }}>{state.error}</p>}
    </form>
  );
}
