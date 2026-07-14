"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClass, deleteClass } from "@/app/actions/classes";
import { addStudents, removeStudent } from "@/app/actions/roster";
import { Icon } from "@/components/icons/Icon";

export type RosterChild = {
  id: string;
  name: string;
  initial: string;
  avatarColor: string;
  moments: number;
  waiting: number;
  last: string;
};

export type ClassCard = {
  id: string;
  name: string;
  year: string;
  code: string;
  color: string;
  jarFill: string;
  kids: number;
  moments: number;
  waiting: number;
  roster: RosterChild[];
};

// A small kraft-lidded jar with two work tiles, tinted per class.
function JarMark({ width, height, jarFill }: { width: number; height: number; jarFill: string }) {
  return (
    <svg width={width} height={height} viewBox="0 0 100 120" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
      <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="#FFFDF7" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />
      <rect x="30" y="80" width="14" height="14" rx="3" fill={jarFill} transform="rotate(-8 37 87)" />
      <rect x="52" y="84" width="14" height="14" rx="3" fill="#F0B441" transform="rotate(6 59 91)" />
    </svg>
  );
}

const JAM_BTN: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "var(--paper)",
  background: "var(--jam)",
  border: "none",
  borderRadius: 999,
  padding: "12px 24px",
  cursor: "pointer",
  boxShadow: "0 3px 0 var(--jam-deep)",
};
const OUTLINE_BTN: React.CSSProperties = {
  font: "700 14px var(--font-atkinson)",
  color: "var(--ink)",
  background: "var(--cream)",
  border: "2px solid var(--ink)",
  borderRadius: 999,
  padding: "10px 18px",
  cursor: "pointer",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  font: "400 17px var(--font-atkinson)",
  padding: "12px 14px",
  border: "3px solid var(--ink)",
  borderRadius: 12,
  background: "var(--paper)",
  color: "var(--ink)",
};
const DANGER_BTN: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "var(--paper)",
  background: "var(--jam)",
  border: "none",
  borderRadius: 999,
  padding: "12px 22px",
  cursor: "pointer",
  boxShadow: "0 3px 0 var(--jam-deep)",
};
const DANGER_OUTLINE_BTN: React.CSSProperties = {
  font: "700 14px var(--font-atkinson)",
  color: "var(--jam)",
  background: "none",
  border: "2px solid var(--jam)",
  borderRadius: 999,
  padding: "8px 16px",
  cursor: "pointer",
};

export function ClassManager({ classes }: { classes: ClassCard[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [settings, setSettings] = useState(false);

  // Interruption resilience (FINDINGS F12): a *reload* shouldn't lose your place.
  // Restore the open class (and add-child panel) from sessionStorage ONLY when
  // the page was reloaded — not on normal navigation, so clicking "Classes" in
  // the nav still lands on the grid as expected. Transient storage (cleared on
  // tab close) keeps nothing on the device longer than the working session.
  useEffect(() => {
    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav?.type !== "reload") return;
      const saved = JSON.parse(sessionStorage.getItem("sj-class-place") || "null");
      if (saved && classes.some((c) => c.id === saved.openId)) {
        setOpenId(saved.openId);
        setAddingChild(!!saved.addingChild);
      }
    } catch {
      /* ignore malformed state / missing API */
    }
    // Mount only — restore once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (openId) sessionStorage.setItem("sj-class-place", JSON.stringify({ openId, addingChild }));
      else sessionStorage.removeItem("sj-class-place");
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, [openId, addingChild]);

  const open = classes.find((c) => c.id === openId) ?? null;

  // If the open class disappears (e.g. deleted), fall back to the grid.
  useEffect(() => {
    if (openId && !open) setOpenId(null);
  }, [openId, open]);

  const openClass = (id: string) => {
    setOpenId(id);
    setAddingChild(false);
    setSettings(false);
  };

  if (open) {
    return (
      <RosterView
        klass={open}
        addingChild={addingChild}
        settings={settings}
        onBack={() => setOpenId(null)}
        onToggleAdd={() => setAddingChild((v) => !v)}
        onToggleSettings={() => setSettings((v) => !v)}
      />
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 26 }}>
        <div>
          <h1 style={{ margin: 0, font: "600 32px var(--font-fredoka)" }}>Your classes</h1>
          <p style={{ margin: "6px 0 0", font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            {classes.length === 1 ? "1 class" : `${classes.length} classes`} · tap a card to open its list
          </p>
        </div>
        <button onClick={() => setCreating((v) => !v)} style={{ ...JAM_BTN, marginLeft: "auto" }}>＋ New class</button>
      </div>

      {creating && <NewClassForm onCreated={() => setCreating(false)} />}

      {classes.length === 0 && !creating && (
        <div className="sj-card" style={{ padding: "40px 32px", textAlign: "center" }}>
          <JarMark width={54} height={65} jarFill="#C2476B" />
          <p style={{ margin: "12px 0 0", font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>No classes yet — make your first jar with <strong>＋ New class</strong>.</p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => openClass(c.id)}
            style={{ textAlign: "left", cursor: "pointer", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 18, padding: 0, overflow: "hidden", boxShadow: "0 4px 0 rgba(34,48,74,0.14)", display: "flex", flexDirection: "column" }}
          >
            <div style={{ background: c.color, borderBottom: "3px solid var(--ink)", position: "relative", display: "flex", alignItems: "center", padding: "18px 20px", gap: 14, alignSelf: "stretch" }}>
              <JarMark width={46} height={55} jarFill={c.jarFill} />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, font: "600 24px var(--font-fredoka)", color: "var(--ink)" }}>{c.name}</p>
                <p style={{ margin: "2px 0 0", font: "700 13px var(--font-atkinson)", color: "var(--ink-soft)" }}>{c.year}</p>
              </div>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 20 }}>
              <div>
                <p style={{ margin: 0, font: "600 26px var(--font-fredoka)", lineHeight: 1 }}>{c.kids}</p>
                <p style={{ margin: "3px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>pupils</p>
              </div>
              <div style={{ width: 2, alignSelf: "stretch", background: "#EDE4D2" }} />
              <div>
                <p style={{ margin: 0, font: "600 26px var(--font-fredoka)", lineHeight: 1 }}>{c.moments}</p>
                <p style={{ margin: "3px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>in the jar</p>
              </div>
            </div>
            <div style={{ marginTop: "auto", padding: "12px 20px", borderTop: "2px dashed #EDE4D2", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, alignSelf: "stretch" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "700 13px var(--font-atkinson)", color: c.waiting > 0 ? "var(--jam)" : "var(--glass-ink)", minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: c.waiting > 0 ? "var(--jam)" : "var(--glass-ink)", flexShrink: 0 }} />
                {c.waiting > 0 ? `${c.waiting} waiting to approve` : "All caught up"}
              </span>
              <span style={{ font: "700 14px var(--font-atkinson)", color: "var(--jam)", whiteSpace: "nowrap", flexShrink: 0 }}>Open →</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

// ── Roster / class-detail view ──
function RosterView({
  klass,
  addingChild,
  settings,
  onBack,
  onToggleAdd,
  onToggleSettings,
}: {
  klass: ClassCard;
  addingChild: boolean;
  settings: boolean;
  onBack: () => void;
  onToggleAdd: () => void;
  onToggleSettings: () => void;
}) {
  return (
    <>
      <button onClick={onBack} style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16 }}>← All classes</button>

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", background: klass.color, border: "3px solid var(--ink)", borderRadius: 18, padding: "20px 24px", boxShadow: "0 4px 0 rgba(34,48,74,0.14)" }}>
        <JarMark width={54} height={65} jarFill={klass.jarFill} />
        <div>
          <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)" }}>{klass.name}</h1>
          <p style={{ margin: "4px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--ink-soft)" }}>
            {klass.year} · {klass.kids} {klass.kids === 1 ? "pupil" : "pupils"} · class code <strong>{klass.code}</strong>
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href={`/signup/teacher/welcome?class=${klass.id}`}
            style={{ ...OUTLINE_BTN, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Icon name="print" size={18} decorative /> Printable code
          </Link>
          <button onClick={onToggleSettings} style={{ ...OUTLINE_BTN, display: "inline-flex", alignItems: "center", gap: 8 }} aria-pressed={settings}><Icon name="settings" size={18} decorative /> Class settings</button>
          <button onClick={onToggleAdd} style={{ ...JAM_BTN, padding: "11px 20px", fontSize: 14 }} aria-pressed={addingChild}>＋ Add pupil</button>
        </div>
      </div>

      {settings && <SettingsStrip klass={klass} />}
      {addingChild && <AddChildForm classId={klass.id} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "24px 0 14px" }}>
        <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Class list</h2>
        <span style={{ font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>sorted by first name</span>
      </div>

      {klass.roster.length === 0 ? (
        <p className="sj-card" style={{ padding: "28px 24px", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          No pupils yet — add your class list with <strong>＋ Add pupil</strong>.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {klass.roster.map((k) => (
            <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--cream)", border: "2px solid var(--calm-border)", borderRadius: 14, padding: "12px 16px" }}>
              <span style={{ width: 46, height: 46, borderRadius: "50%", background: k.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", font: "600 20px var(--font-fredoka)", color: "#FFFDF7", flexShrink: 0 }}>{k.initial}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, font: "700 17px var(--font-atkinson)" }}>{k.name}</p>
                <p style={{ margin: "2px 0 0", font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>
                  {k.moments} {k.moments === 1 ? "moment" : "moments"} · last {k.last}
                </p>
              </div>
              {k.waiting > 0 && (
                <span style={{ background: "var(--error-tint)", color: "var(--jam)", borderRadius: 999, padding: "4px 10px", font: "700 12px var(--font-atkinson)", flexShrink: 0 }}>{k.waiting} waiting</span>
              )}
              {settings ? (
                <form action={removeStudent}>
                  <input type="hidden" name="studentId" value={k.id} />
                  <button type="submit" style={{ font: "700 13px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>Remove</button>
                </form>
              ) : (
                <Link href={`/teacher/students/${k.id}`} style={{ font: "700 14px var(--font-atkinson)", color: "var(--jam)", textDecoration: "none", flexShrink: 0 }}>Journal →</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SettingsStrip({ klass }: { klass: ClassCard }) {
  return (
    <div className="sj-card" style={{ marginTop: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <p style={{ margin: 0, font: "400 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>
        Class code <strong style={{ letterSpacing: "0.12em" }}>{klass.code}</strong> · settings mode: use <strong>Remove</strong> beside a pupil to take them off the register.
      </p>
      {/* Data export (F4) — download the whole class as JSON at any time. */}
      <a
        href={`/teacher/export/${klass.id}`}
        download
        style={{ ...OUTLINE_BTN, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
      >
        <Icon name="download" size={18} decorative /> Export class data
      </a>
      <DeleteClassZone klass={klass} />
    </div>
  );
}

// Danger zone: permanently delete a whole class at once. Deliberate friction —
// the teacher must re-type the class name (exactly) and then confirm a second
// time. The name is re-checked on the server, which also erases the children's
// media files and audits the deletion (see deleteClass in actions/classes.ts).
function DeleteClassZone({ klass }: { klass: ClassCard }) {
  const [open, setOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed === klass.name; // exact, case-sensitive

  const close = () => {
    setOpen(false);
    setConfirmStep(false);
    setTyped("");
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const totalMoments = klass.moments + klass.waiting;

  return (
    <div style={{ marginLeft: "auto" }}>
      <button onClick={() => setOpen(true)} style={{ ...DANGER_OUTLINE_BTN, display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="delete" size={18} decorative /> Delete this class…</button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Delete ${klass.name}`}
          onClick={close}
          style={{ position: "fixed", inset: 0, background: "rgba(34,48,74,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="sj-card" style={{ maxWidth: 470, width: "100%", padding: "26px 26px 24px", textAlign: "left" }}>
            {!confirmStep ? (
              <>
                <p style={{ margin: "0 0 4px", font: "700 12px var(--font-atkinson)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--jam)" }}>Permanent · cannot be undone</p>
                <h3 style={{ margin: "0 0 8px", font: "600 24px var(--font-fredoka)", color: "var(--ink)" }}>Delete “{klass.name}”?</h3>
                <p style={{ margin: "0 0 16px", font: "400 15px/1.55 var(--font-atkinson)", color: "var(--ink-soft)" }}>
                  This <strong>permanently deletes</strong> this class, all {klass.kids} {klass.kids === 1 ? "pupil" : "pupils"}
                  {totalMoments > 0 ? <> and their {totalMoments} {totalMoments === 1 ? "moment" : "moments"}</> : null} — every photo, drawing and word — including the files themselves. <strong style={{ color: "var(--jam)" }}>This cannot be undone.</strong>
                </p>
                <label htmlFor={`confirm-${klass.id}`} style={{ display: "block", font: "700 14px var(--font-atkinson)", marginBottom: 6 }}>
                  Type the class name{" "}
                  <code style={{ background: "var(--paper)", border: "1px solid var(--calm-border)", borderRadius: 6, padding: "1px 6px" }}>{klass.name}</code>{" "}
                  to confirm (exactly, capitals included):
                </label>
                <input
                  id={`confirm-${klass.id}`}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  aria-label="Type the class name to confirm"
                  style={INPUT}
                />
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
                  <button onClick={close} style={OUTLINE_BTN}>Cancel</button>
                  <button
                    onClick={() => setConfirmStep(true)}
                    disabled={!matches}
                    style={{ ...DANGER_BTN, opacity: matches ? 1 : 0.5, cursor: matches ? "pointer" : "not-allowed" }}
                  >
                    Delete class
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: "0 0 8px", font: "600 24px var(--font-fredoka)", color: "var(--jam)" }}>Are you absolutely sure?</h3>
                <p style={{ margin: "0 0 18px", font: "400 15px/1.55 var(--font-atkinson)", color: "var(--ink-soft)" }}>
                  You’re about to permanently delete <strong>{klass.name}</strong> and everything in it. There is no way back.
                </p>
                <form action={deleteClass} style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <input type="hidden" name="classId" value={klass.id} />
                  <input type="hidden" name="confirmName" value={typed} />
                  <button type="button" onClick={() => setConfirmStep(false)} style={OUTLINE_BTN}>← Go back</button>
                  <button type="submit" style={DANGER_BTN}>Yes, permanently delete</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Storyjar-styled wrappers around the existing server actions ──
function NewClassForm({ onCreated }: { onCreated: () => void }) {
  const [state, action, pending] = useActionState(createClass, {});
  const ref = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      ref.current?.reset();
      onCreated();
    }
    wasPending.current = pending;
  }, [pending, state, onCreated]);

  return (
    <form ref={ref} action={action} className="sj-card" style={{ padding: "18px 20px", marginBottom: 20, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <label htmlFor="className" style={{ display: "block", font: "700 14px var(--font-atkinson)", marginBottom: 6 }}>Class name</label>
        <input id="className" name="name" placeholder="e.g. Bluebell Class" autoComplete="off" required style={INPUT} />
      </div>
      <button type="submit" disabled={pending} style={{ ...JAM_BTN, opacity: pending ? 0.7 : 1 }}>{pending ? "Creating…" : "Create class"}</button>
      {state.error && <p role="alert" style={{ width: "100%", margin: 0, font: "700 14px var(--font-atkinson)", color: "var(--jam)" }}>{state.error}</p>}
    </form>
  );
}

function AddChildForm({ classId }: { classId: string }) {
  const [state, action, pending] = useActionState(addStudents, {});
  const ref = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState("");
  const draftKey = `sj-draft-add-${classId}`;

  // Restore any half-typed register after a reload (FINDINGS F12).
  useEffect(() => {
    try {
      const d = sessionStorage.getItem(draftKey);
      if (d) setValue(d);
    } catch {
      /* storage unavailable */
    }
  }, [draftKey]);
  // Keep the draft in sync as they type.
  useEffect(() => {
    try {
      if (value) sessionStorage.setItem(draftKey, value);
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* storage unavailable */
    }
  }, [value, draftKey]);

  useEffect(() => {
    if (!pending && !state.error && state.added) {
      ref.current?.reset();
      setValue("");
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* storage unavailable */
      }
    }
  }, [pending, state, draftKey]);

  const count = new Set(
    value.split(/[\n,]+/).map((n) => n.trim().toLowerCase()).filter(Boolean),
  ).size;

  return (
    <form ref={ref} action={action} className="sj-card" style={{ padding: "18px 20px", marginTop: 14 }}>
      <input type="hidden" name="classId" value={classId} />
      <label htmlFor={`names-${classId}`} style={{ display: "block", font: "700 14px var(--font-atkinson)", marginBottom: 6 }}>Add pupils — one per line (paste your register; surnames are fine)</label>
      <textarea
        id={`names-${classId}`}
        name="names"
        rows={3}
        placeholder={"Poppy Fields\nJesse Cole\nAmara"}
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ ...INPUT, font: "400 17px/1.6 var(--font-atkinson)", resize: "vertical" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button type="submit" disabled={pending || count === 0} style={{ ...JAM_BTN, opacity: pending || count === 0 ? 0.6 : 1, cursor: count === 0 ? "default" : "pointer" }}>
          {pending ? "Adding…" : count > 1 ? `Add ${count} pupils` : "Add pupil"}
        </button>
        <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>We keep first names only — no emails, ever.</span>
        {state.error && <p role="alert" style={{ margin: 0, font: "700 14px var(--font-atkinson)", color: "var(--jam)" }}>{state.error}</p>}
      </div>
    </form>
  );
}
