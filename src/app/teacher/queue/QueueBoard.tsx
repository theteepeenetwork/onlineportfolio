"use client";

import { useRef, useState } from "react";
import { approveItem, returnItem } from "@/app/actions/journal";
import { JarLogo } from "@/components/storyjar/JarLogo";
import { Icon, type IconName } from "@/components/icons/Icon";

type Skill = { id: string; name: string };
type QuizLine = {
  prompt: string;
  chosen: { text: string; imagePath?: string } | null;
  correct: { text: string; imagePath?: string } | null;
  isCorrect: boolean;
};
type Item = {
  id: string;
  child: string;
  color: string;
  type: string;
  mediaPath: string | null;
  text: string | null;
  isActivity: boolean;
  activity: string;
  when: string;
  quizScore: number | null;
  quizTotal: number | null;
  quizReview: QuizLine[] | null;
};

const KIND: Record<string, { label: string; bg: string; icon: IconName }> = {
  PHOTO: { label: "photo", bg: "#DEEAF3", icon: "camera" },
  DRAWING: { label: "drawing", bg: "#FBEED3", icon: "draw" },
  TEXT: { label: "their words", bg: "#F7E0E6", icon: "write" },
};
const kindOf = (t: string) => KIND[t] ?? KIND.PHOTO;

export function QueueBoard({ items, skills }: { items: Item[]; skills: Skill[] }) {
  const [live, setLive] = useState(items);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  // When sending an activity back: keep the child's work to tweak (true) or
  // let them start again from a blank template (false). Defaults to keeping it.
  const [keepWork, setKeepWork] = useState(true);
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
      // Only activity drawings can be reopened, so only they carry a mode.
      if (item.isActivity) fd.set("returnMode", keepWork ? "CONTINUE" : "FRESH");
      await returnItem(fd);
      setNoteOpen(null);
      setNoteText("");
      remove([item.id]);
      showToast(
        item.isActivity && !keepWork
          ? `↩ Sent back to ${item.child} to start again`
          : `↩ Sent back to ${item.child} with your note`,
      );
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
          <button onClick={toggleAll} style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 999, padding: "10px 20px", minHeight: 44, cursor: "pointer", whiteSpace: "nowrap" }}>{allSelected ? "Unselect all" : "Select all"}</button>
          <button onClick={approveSelected} disabled={busy} style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "#37796f", border: "none", borderRadius: 999, padding: "12px 24px", minHeight: 44, cursor: "pointer", boxShadow: "0 3px 0 #35706A", whiteSpace: "nowrap", opacity: busy ? 0.7 : 1 }}>✓ Add {selCount} to their jars</button>
        </div>
      </div>

      {/* rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
        {live.map((it) => {
          const k = kindOf(it.type);
          const sel = selected.has(it.id);
          const chosen = skillSel[it.id] ?? new Set<string>();
          return (
            <div key={it.id} data-child={it.child} style={{ background: "var(--cream)", border: `2px solid ${sel ? "#37796f" : "var(--calm-border)"}`, borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <input type="checkbox" checked={sel} onChange={() => toggleSel(it.id)} aria-label={`Select ${it.child}`} style={{ width: 20, height: 20, accentColor: "#37796f", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ width: 84, height: 64, borderRadius: 10, background: k.bg, border: "2px solid var(--calm-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0, overflow: "hidden" }}>
                  {it.mediaPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.mediaPath} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : it.text ? (
                    <Icon name="write" size={28} decorative />
                  ) : (
                    <Icon name={k.icon} size={30} decorative />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <p style={{ margin: 0, font: "700 17px var(--font-atkinson)" }}>{it.child} <span style={{ fontWeight: 400, color: "var(--sj-muted)" }}>· {k.label}</span></p>
                  <p style={{ margin: "3px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>{it.activity} · {it.when}</p>
                  {it.quizTotal != null && (
                    <button
                      type="button"
                      onClick={() => setQuizOpen(quizOpen === it.id ? null : it.id)}
                      aria-expanded={quizOpen === it.id}
                      style={{ marginTop: 6, font: "700 13px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", border: "2px solid #37796f", borderRadius: 999, padding: "4px 12px", minHeight: 32, cursor: "pointer" }}
                    >
                      ❓ Quiz {it.quizScore}/{it.quizTotal} · {quizOpen === it.id ? "hide" : "review"}
                    </button>
                  )}
                </div>
                {skills.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 340 }}>
                    {skills.map((sk) => {
                      const on = chosen.has(sk.id);
                      return (
                        <button key={sk.id} onClick={() => toggleSkill(it.id, sk.id)} style={{ font: "700 13px var(--font-atkinson)", color: on ? "#2E6B64" : "var(--sj-muted)", background: on ? "var(--glass-light)" : "var(--cream)", border: `2px solid ${on ? "#37796f" : "var(--calm-border)"}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>{sk.name}</button>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => approve(it)} disabled={busy} style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "#37796f", border: "none", borderRadius: 999, padding: "10px 20px", minHeight: 44, cursor: "pointer", boxShadow: "0 3px 0 #35706A", whiteSpace: "nowrap" }}>✓ Add to jar</button>
                  <button onClick={() => { setNoteOpen(noteOpen === it.id ? null : it.id); setNoteText(""); setKeepWork(true); }} style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 999, padding: "10px 18px", minHeight: 44, cursor: "pointer", whiteSpace: "nowrap" }}>↩ Send back</button>
                </div>
              </div>

              {noteOpen === it.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: "2px dashed var(--calm-border)" }}>
                  {it.isActivity && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <span style={{ font: "700 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>When they reopen it:</span>
                      {[
                        { on: true, label: "✏️ Carry on with their work", hint: "Keeps what they did so they can tweak it" },
                        { on: false, label: "🔄 Start again", hint: "Clears their work — a fresh blank page" },
                      ].map((opt) => {
                        const active = keepWork === opt.on;
                        return (
                          <button
                            key={String(opt.on)}
                            type="button"
                            onClick={() => setKeepWork(opt.on)}
                            aria-pressed={active}
                            title={opt.hint}
                            style={{ font: "700 14px var(--font-atkinson)", color: active ? "#2E6B64" : "var(--sj-muted)", background: active ? "var(--glass-light)" : "var(--cream)", border: `2px solid ${active ? "#37796f" : "var(--calm-border)"}`, borderRadius: 999, padding: "8px 16px", minHeight: 40, cursor: "pointer" }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="A kind note — e.g. 'Lovely! Can you add a label to your diagram?'" style={{ flex: 1, minWidth: 220, font: "400 15px var(--font-atkinson)", padding: "10px 14px", border: "2px solid var(--calm-border)", borderRadius: 10, background: "var(--paper)", color: "var(--ink)" }} />
                    <button onClick={() => sendBack(it)} disabled={busy} style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "none", borderRadius: 999, padding: "10px 22px", cursor: "pointer" }}>Send back</button>
                  </div>
                </div>
              )}

              {quizOpen === it.id && it.quizReview && (
                <ul style={{ listStyle: "none", margin: "14px 0 0", padding: "14px 0 0", borderTop: "2px dashed var(--calm-border)", display: "flex", flexDirection: "column", gap: 10 }}>
                  {it.quizReview.map((q, i) => (
                    <li key={i} style={{ font: "400 14px var(--font-atkinson)" }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>
                        <span aria-hidden="true" style={{ marginRight: 6 }}>{q.isCorrect ? "✅" : "❌"}</span>
                        {q.prompt || `Question ${i + 1}`}
                      </p>
                      <p style={{ margin: "2px 0 0", color: "var(--sj-muted)" }}>
                        Their answer: <span style={{ color: q.isCorrect ? "#2E6B64" : "var(--jam)", fontWeight: 700 }}>{q.chosen?.text ?? "—"}</span>
                        {!q.isCorrect && q.correct && <> · Correct: <span style={{ fontWeight: 700 }}>{q.correct.text}</span></>}
                      </p>
                    </li>
                  ))}
                </ul>
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
