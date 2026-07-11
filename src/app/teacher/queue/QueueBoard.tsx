"use client";

import { useRef, useState } from "react";
import { approveItem, returnItem } from "@/app/actions/journal";
import { JarLogo } from "@/components/storyjar/JarLogo";

type Skill = { id: string; name: string };
type Item = {
  id: string;
  child: string;
  color: string;
  type: string;
  mediaPath: string | null;
  text: string | null;
  activity: string;
  when: string;
};

const KIND: Record<string, { label: string; bg: string; emoji: string }> = {
  PHOTO: { label: "photo", bg: "#DEEAF3", emoji: "📷" },
  DRAWING: { label: "drawing", bg: "#FBEED3", emoji: "🖍" },
  TEXT: { label: "their words", bg: "#F7E0E6", emoji: "⌨" },
};
const kindOf = (t: string) => KIND[t] ?? KIND.PHOTO;

export function QueueBoard({ items, skills }: { items: Item[]; skills: Skill[] }) {
  const [live, setLive] = useState(items);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [skillSel, setSkillSel] = useState<Record<string, Set<string>>>({});
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2800);
  };

  const remove = (ids: string[]) => {
    setLive((prev) => prev.filter((it) => !ids.includes(it.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const approve = async (item: Item) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("itemId", item.id);
      (skillSel[item.id] ?? new Set()).forEach((sid) => fd.append("skillIds", sid));
      await approveItem(fd);
      remove([item.id]);
      showToast(`✓ Added to ${item.child}'s jar`);
    } finally {
      setBusy(false);
    }
  };

  const approveSelected = async () => {
    const ids = selected.size ? [...selected] : live.map((it) => it.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      for (const id of ids) {
        const fd = new FormData();
        fd.set("itemId", id);
        (skillSel[id] ?? new Set()).forEach((sid) => fd.append("skillIds", sid));
        await approveItem(fd);
      }
      remove(ids);
      showToast(`✓ ${ids.length} moment${ids.length === 1 ? "" : "s"} added to their jars`);
    } finally {
      setBusy(false);
    }
  };

  const sendBack = async (item: Item) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("itemId", item.id);
      if (noteText.trim()) fd.set("teacherNote", noteText.trim());
      await returnItem(fd);
      setNoteOpen(null);
      setNoteText("");
      remove([item.id]);
      showToast(`↩ Sent back to ${item.child} with your note`);
    } finally {
      setBusy(false);
    }
  };

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = live.length > 0 && live.every((it) => selected.has(it.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(live.map((it) => it.id)));

  const toggleSkill = (itemId: string, skillId: string) => {
    setSkillSel((prev) => {
      const cur = new Set(prev[itemId] ?? []);
      if (cur.has(skillId)) cur.delete(skillId); else cur.add(skillId);
      return { ...prev, [itemId]: cur };
    });
  };

  if (live.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "70px 20px 30px" }}>
        <div style={{ display: "inline-block" }}><JarLogo width={90} height={112} jarFill="#EAF4F1" /></div>
        <h2 style={{ margin: "18px 0 0", font: "600 26px var(--font-fredoka)" }}>All caught up ☕</h2>
        <p style={{ margin: "8px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>Every moment is in its jar. Put the kettle on.</p>
      </div>
    );
  }

  const selCount = selected.size ? selected.size : "all";

  return (
    <>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)" }}>Waiting for you</h1>
        <span style={{ font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>{live.length} moment{live.length === 1 ? "" : "s"}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={toggleAll} style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 999, padding: "10px 20px", cursor: "pointer", whiteSpace: "nowrap" }}>{allSelected ? "Unselect all" : "Select all"}</button>
          <button onClick={approveSelected} disabled={busy} style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--glass)", border: "none", borderRadius: 999, padding: "12px 24px", cursor: "pointer", boxShadow: "0 3px 0 #35706A", whiteSpace: "nowrap", opacity: busy ? 0.7 : 1 }}>✓ Add {selCount} to their jars</button>
        </div>
      </div>

      {/* rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
        {live.map((it) => {
          const k = kindOf(it.type);
          const sel = selected.has(it.id);
          const chosen = skillSel[it.id] ?? new Set<string>();
          return (
            <div key={it.id} data-child={it.child} style={{ background: "var(--cream)", border: `2px solid ${sel ? "var(--glass)" : "var(--calm-border)"}`, borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <input type="checkbox" checked={sel} onChange={() => toggleSel(it.id)} aria-label={`Select ${it.child}`} style={{ width: 20, height: 20, accentColor: "var(--glass)", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ width: 84, height: 64, borderRadius: 10, background: k.bg, border: "2px solid var(--calm-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0, overflow: "hidden" }}>
                  {it.mediaPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.mediaPath} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : it.text ? (
                    <span style={{ fontSize: 26 }} aria-hidden="true">⌨</span>
                  ) : (
                    <span aria-hidden="true">{k.emoji}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={{ margin: 0, font: "700 17px var(--font-atkinson)" }}>{it.child} <span style={{ fontWeight: 400, color: "var(--sj-muted)" }}>· {k.label}</span></p>
                  <p style={{ margin: "3px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>{it.activity} · {it.when}</p>
                </div>
                {skills.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 340 }}>
                    {skills.map((sk) => {
                      const on = chosen.has(sk.id);
                      return (
                        <button key={sk.id} onClick={() => toggleSkill(it.id, sk.id)} style={{ font: "700 13px var(--font-atkinson)", color: on ? "#2E6B64" : "var(--sj-muted)", background: on ? "var(--glass-light)" : "var(--cream)", border: `2px solid ${on ? "var(--glass)" : "var(--calm-border)"}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>{sk.name}</button>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => approve(it)} disabled={busy} style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--glass)", border: "none", borderRadius: 999, padding: "10px 20px", cursor: "pointer", boxShadow: "0 3px 0 #35706A", whiteSpace: "nowrap" }}>✓ Add to jar</button>
                  <button onClick={() => { setNoteOpen(noteOpen === it.id ? null : it.id); setNoteText(""); }} style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 999, padding: "10px 18px", cursor: "pointer", whiteSpace: "nowrap" }}>↩ Send back</button>
                </div>
              </div>

              {noteOpen === it.id && (
                <div style={{ display: "flex", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "2px dashed var(--calm-border)", flexWrap: "wrap" }}>
                  <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="A kind note — e.g. 'Lovely! Can you add a label to your diagram?'" style={{ flex: 1, minWidth: 220, font: "400 15px var(--font-atkinson)", padding: "10px 14px", border: "2px solid var(--calm-border)", borderRadius: 10, background: "var(--paper)", color: "var(--ink)" }} />
                  <button onClick={() => sendBack(it)} disabled={busy} style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "none", borderRadius: 999, padding: "10px 22px", cursor: "pointer" }}>Send back</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div role="status" style={{ position: "sticky", bottom: 24, display: "flex", justifyContent: "center", pointerEvents: "none", marginTop: 24 }}>
          <div style={{ background: "var(--ink)", color: "var(--paper)", borderRadius: 999, padding: "12px 26px", font: "700 15px var(--font-atkinson)", boxShadow: "0 8px 24px rgba(34,48,74,0.3)" }}>{toast}</div>
        </div>
      )}
    </>
  );
}
