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

  const closeMenus = () => {
    setMenuId(null);
    setMoveId(null);
  };

  const countFor = (id: string) => {
    if (id === ALL) return templates.filter((t) => !t.archived).length;
    if (id === ARCHIVED) return templates.filter((t) => t.archived).length;
    return templates.filter((t) => !t.archived && t.folderId === id).length;
  };

  const sidebar: (FolderInfo & { special?: boolean })[] = [
    { id: ALL, name: "All activities", color: "#C9C2B0", special: true },
    ...folders,
    { id: ARCHIVED, name: "Archived", color: "#B99CD6", special: true },
  ];

  const shown = templates.filter((t) => {
    if (folder === ALL) return !t.archived;
    if (folder === ARCHIVED) return t.archived;
    return !t.archived && t.folderId === folder;
  });

  const folderName = sidebar.find((f) => f.id === folder)?.name ?? "All activities";
  const assignTemplate = templates.find((t) => t.id === assignId);

  return (
    // Clicking anywhere outside an open menu closes it (the backdrop-close rule).
    <div
      onClick={closeMenus}
      style={{ display: "grid", gridTemplateColumns: "232px 1fr", maxWidth: 1180, margin: "0 auto", alignItems: "start", padding: "0 24px" }}
    >
      {/* ══ folders sidebar ══ */}
      <aside style={{ padding: "28px 18px 40px", position: "sticky", top: 66 }}>
        <p style={{ margin: "0 0 10px", font: "700 12px var(--font-atkinson)", color: "var(--sj-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Folders</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {sidebar.map((f) => {
            const active = folder === f.id;
            return (
              <button
                key={f.id}
                onClick={() => { setFolder(f.id); closeMenus(); }}
                style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer", font: "700 15px var(--font-atkinson)", color: active ? "var(--ink)" : "var(--ink-soft)", background: active ? "#F3E3C3" : "transparent", border: "none", borderRadius: 10, padding: "10px 12px" }}
              >
                <span style={{ width: 14, height: 14, borderRadius: 4, background: f.color, border: "2px solid var(--ink)", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{f.name}</span>
                <span style={{ font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>{countFor(f.id)}</span>
              </button>
            );
          })}
        </div>
        {creatingFolder ? (
          <NewFolderForm onDone={() => setCreatingFolder(false)} />
        ) : (
          <button
            onClick={() => setCreatingFolder(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 14, cursor: "pointer", font: "700 14px var(--font-atkinson)", color: "var(--ink-soft)", background: "none", border: "2px dashed #C9C2B0", borderRadius: 10, padding: "10px 12px" }}
          >
            ＋ New folder
          </button>
        )}
      </aside>

      {/* ══ activities ══ */}
      <main style={{ padding: "28px 8px 60px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)" }}>{folderName}</h1>
            <p style={{ margin: "5px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              {shown.length === 0 ? "Nothing here yet" : `${shown.length} ${shown.length === 1 ? "activity" : "activities"}`}
            </p>
          </div>
          <Link href="/teacher/activities/new" style={{ marginLeft: "auto", font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", textDecoration: "none", borderRadius: 999, padding: "12px 24px", boxShadow: "0 3px 0 var(--jam-deep)" }}>＋ New activity</Link>
        </div>

        {shown.length === 0 ? (
          <div className="sj-card" style={{ padding: "48px 32px", textAlign: "center" }}>
            <Icon name="add-file" size={44} decorative />
            <p style={{ margin: "10px 0 0", font: "600 20px var(--font-fredoka)" }}>Nothing here yet</p>
            <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>Make a reusable activity to assign to your classes.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
            {shown.map((t) => {
              const tm = typeMeta(t);
              const open = menuId === t.id;
              return (
                <div
                  key={t.id}
                  style={{ position: "relative", zIndex: open ? 20 : 1, background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "18px 20px", boxShadow: "0 3px 0 rgba(34,48,74,0.08)" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: tm.bg, border: "2px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} aria-hidden><Icon name={tm.icon} size={24} decorative /></span>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 34 }}>
                      <Link href={`/teacher/activities/${t.id}`} style={{ margin: 0, font: "600 19px/1.2 var(--font-fredoka)", color: "var(--ink)", textDecoration: "none" }}>{t.title}</Link>
                      <p style={{ margin: "4px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>{tm.label}</p>
                    </div>

                    {/* 3-dot button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setMoveId(null); setMenuId(open ? null : t.id); }}
                      aria-label={`More actions for ${t.title}`}
                      aria-expanded={open}
                      style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: 8, border: "none", background: open ? "#F3E3C3" : "#F3EEE2", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}
                    >
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ink-soft)" }} />
                      ))}
                    </button>

                    {/* dropdown — sits ABOVE the cards (card is overflow-visible; open card z-raised) */}
                    {open && (
                      <div
                        role="menu"
                        onClick={(e) => e.stopPropagation()}
                        style={{ position: "absolute", top: 50, right: 14, width: 208, background: "var(--cream)", border: "2px solid var(--ink)", borderRadius: 12, padding: 6, boxShadow: "0 12px 30px rgba(34,48,74,0.28)", zIndex: 40 }}
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

                  {t.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
                      {t.tags.map((sk) => (
                        <span key={sk} style={{ font: "700 12px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", border: "1px solid #B6D8D2", borderRadius: 999, padding: "4px 10px" }}>{sk}</span>
                      ))}
                    </div>
                  )}
                  <p style={{ margin: "12px 0 0", paddingTop: 12, borderTop: "1px solid #F0EADD", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                    {t.liveClassNames.length > 0
                      ? `Live in ${t.liveClassNames.length} class${t.liveClassNames.length === 1 ? "" : "es"}${t.waiting > 0 ? ` · ${t.waiting} waiting` : ""}`
                      : t.sentClasses > 0
                        ? `Sent to ${t.sentClasses} class${t.sentClasses === 1 ? "" : "es"}`
                        : "Not sent to a class yet"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </main>

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
    <form ref={ref} action={action} style={{ marginTop: 14 }}>
      <input
        name="name"
        autoFocus
        placeholder="Folder name"
        required
        style={{ width: "100%", boxSizing: "border-box", font: "400 14px var(--font-atkinson)", padding: "9px 11px", border: "2px solid var(--ink)", borderRadius: 10, background: "var(--paper)", color: "var(--ink)" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="submit" disabled={pending} style={{ flex: 1, font: "700 13px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "none", borderRadius: 999, padding: "8px 0", cursor: "pointer" }}>{pending ? "…" : "Create"}</button>
        <button type="button" onClick={onDone} style={{ font: "700 13px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
      </div>
      {state.error && <p role="alert" style={{ margin: "6px 0 0", font: "700 13px var(--font-atkinson)", color: "var(--jam)" }}>{state.error}</p>}
    </form>
  );
}
