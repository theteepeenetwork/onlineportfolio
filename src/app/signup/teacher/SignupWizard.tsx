"use client";

import { useState } from "react";
import Link from "next/link";
import { createTeacherAccount } from "@/app/actions/auth";
import { deriveTeacherName, type DisplayStyle } from "@/lib/teacherName";

const CARD: React.CSSProperties = {
  background: "var(--cream)",
  border: "3px solid var(--ink)",
  borderRadius: 18,
  padding: "40px 44px",
  boxShadow: "var(--pop-shadow)",
};
const H1: React.CSSProperties = { margin: "18px 0 0", font: "600 34px var(--font-fredoka)" };
const LEAD: React.CSSProperties = { margin: "10px 0 0", font: "400 17px/1.55 var(--font-atkinson)", color: "var(--ink-soft)" };
const FIELD_LABEL: React.CSSProperties = { display: "block", font: "700 16px var(--font-atkinson)", marginBottom: 6 };
const HINT: React.CSSProperties = { margin: "6px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" };
const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  font: "400 18px var(--font-atkinson)",
  padding: "14px 16px",
  border: "3px solid var(--ink)",
  borderRadius: 12,
  background: "var(--paper)",
  color: "var(--ink)",
};
const PRIMARY: React.CSSProperties = {
  font: "700 17px var(--font-atkinson)",
  color: "var(--paper)",
  background: "var(--jam)",
  border: "none",
  padding: "14px 30px",
  borderRadius: 999,
  boxShadow: "0 4px 0 var(--jam-deep)",
  cursor: "pointer",
};
const BACK: React.CSSProperties = { font: "700 16px var(--font-atkinson)", color: "var(--sj-muted)", background: "none", border: "none", cursor: "pointer" };
const STEP_TAG = (bg: string, tilt: string): React.CSSProperties => ({
  display: "inline-block",
  background: bg,
  border: "3px solid var(--ink)",
  borderRadius: 8,
  padding: "4px 14px",
  transform: `rotate(${tilt})`,
  font: "600 16px var(--font-fredoka)",
});

const PROGRESS_FILLS = ["#C2476B", "#F0B441", "#37796f", "#8AB9D6", "#A6C979"];

const COUNTRIES = ["England", "Scotland", "Wales", "Northern Ireland", "Elsewhere"];
// Storyjar is for ages 3–11, so the list runs the full primary phase — Nursery
// and Reception through to Year 6. "Mixed / other" stays last for the classes
// that don't fit a single year (and for Scotland/NI naming).
const YEAR_GROUPS = [
  "Nursery",
  "Reception",
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4",
  "Year 5",
  "Year 6",
  "Mixed / other",
];
const TITLES = ["Mr", "Miss", "Mrs", "Ms", "Mx", ""];

// One of the two "what your class calls you" choice tiles.
const NAME_TILE = (selected: boolean): React.CSSProperties => ({
  flex: 1,
  minWidth: 200,
  cursor: "pointer",
  textAlign: "left",
  font: "700 18px var(--font-fredoka)",
  padding: "14px 18px",
  borderRadius: 12,
  border: "3px solid var(--ink)",
  background: selected ? "var(--glass-light)" : "var(--cream)",
  color: "var(--ink)",
});

function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" style={{ margin: "18px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--jam)", background: "var(--error-tint)", borderRadius: 10, padding: "10px 14px" }}>
      {error}
    </p>
  );
}

export function SignupWizard() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const [title, setTitle] = useState("Mr");
  const [fullName, setFullName] = useState("");
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>("formal");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [school, setSchool] = useState("");
  const [country, setCountry] = useState("England");
  const [yearGroup, setYearGroup] = useState("Year 2");
  const [className, setClassName] = useState("");
  // Age mode is asked once, on the class step. Nothing is pre-selected (the
  // Children's Code forbids nudging a choice about a child's screen), so the
  // initial state is null and skipping it stores null → younger, server-side.
  const [ageMode, setAgeMode] = useState<"KS1" | "KS2" | null>(null);
  const [childrenText, setChildrenText] = useState("");

  const childrenNames = childrenText.split("\n").map((s) => s.trim()).filter(Boolean);
  const n = new Set(childrenNames.map((c) => c.toLowerCase())).size;
  const classNamePreview = className.trim() || "Hedgehogs";

  // Live preview of how the class will be greeted, from title + name + style.
  const { formalName, firstNamePreview, displayName } = deriveTeacherName({ title, fullName, displayStyle });
  const formalLabel = formalName || "Mr Pearson";
  const firstLabel = firstNamePreview || "Sam";
  const greetingName = displayStyle === "first" ? firstLabel : formalLabel;

  const validate = (): string => {
    if (step === 1) {
      if (!fullName.trim()) return "Pop your full name in first.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "That email doesn’t look quite right — check for typos.";
      if (password.length < 8) return "Your password needs at least 8 characters.";
    }
    if (step === 2 && !school.trim()) return "What’s your school called?";
    if (step === 3 && !className.trim()) return "Give your class a name — anything you like.";
    if (step === 4 && n === 0) return "Add at least one first name to get started.";
    return "";
  };

  const goBack = () => {
    setStep((s) => Math.max(1, s - 1));
    setError("");
    window.scrollTo(0, 0);
  };

  const goNext = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    if (step < 4) {
      setStep((s) => s + 1);
      setError("");
      window.scrollTo(0, 0);
      return;
    }
    // Step 4 → create everything on the server. On success the action redirects
    // to the welcome screen; on failure it returns a message + which step to fix.
    setPending(true);
    setError("");
    try {
      const result = await createTeacherAccount({
        title, fullName, displayStyle, email, password, school, country, yearGroup, className, ageMode,
        children: childrenNames,
      });
      if (result?.error) {
        setError(result.error);
        if (result.step) setStep(result.step);
        window.scrollTo(0, 0);
      }
    } catch {
      setError("Something went wrong creating your account. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ width: "100%", maxWidth: 620 }}>
      {/* progress: five segments filling toward a mini jar */}
      {step < 5 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 28px" }}>
          {PROGRESS_FILLS.map((c, i) => (
            <div key={i} style={{ flex: 1, height: 12, borderRadius: 6, border: "2px solid var(--ink)", background: i < step ? c : "var(--cream)", transition: "background 0.3s" }} />
          ))}
          <svg width="26" height="32" viewBox="0 0 100 120" aria-hidden="true" style={{ flexShrink: 0 }}>
            <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
            <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />
          </svg>
          <span style={{ font: "700 14px var(--font-atkinson)", color: "var(--sj-muted)", flexShrink: 0 }}>Step {step} of 5</span>
        </div>
      )}

      {/* ── Step 1: account ── */}
      {step === 1 && (
        <div style={CARD}>
          <div style={STEP_TAG("#F3E3C3", "-2deg")}>Your account</div>
          <h1 style={H1}>First, you</h1>
          <p style={LEAD}>Just you — <strong>pupils never need accounts or emails.</strong></p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 28 }}>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 16 }}>
              <div>
                <label htmlFor="su-title" style={FIELD_LABEL}>Title</label>
                <select id="su-title" value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} style={{ ...INPUT, padding: "14px 14px" }}>
                  {TITLES.map((t) => <option key={t} value={t}>{t === "" ? "Prefer not to say" : t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="su-fullname" style={FIELD_LABEL}>Full name</label>
                <input id="su-fullname" type="text" value={fullName} onChange={(e) => { setFullName(e.target.value); setError(""); }} placeholder="e.g. Sam Pearson" autoComplete="name" style={INPUT} />
              </div>
            </div>
            <div>
              <span style={FIELD_LABEL as React.CSSProperties}>What your class calls you</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => { setDisplayStyle("formal"); setError(""); }} aria-pressed={displayStyle === "formal"} style={NAME_TILE(displayStyle === "formal")}>
                  {formalLabel}
                  <span style={{ display: "block", font: "400 13px var(--font-atkinson)", color: "var(--ink-soft)", marginTop: 2 }}>Title &amp; surname</span>
                </button>
                <button type="button" onClick={() => { setDisplayStyle("first"); setError(""); }} aria-pressed={displayStyle === "first"} style={NAME_TILE(displayStyle === "first")}>
                  {firstLabel}
                  <span style={{ display: "block", font: "400 13px var(--font-atkinson)", color: "var(--ink-soft)", marginTop: 2 }}>First name</span>
                </button>
              </div>
              <p style={{ margin: "8px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>Your class will be greeted with <strong>“Hello {greetingName}”</strong>. You can change this later.</p>
            </div>
            <div>
              <label htmlFor="su-email" style={FIELD_LABEL}>School email</label>
              <input id="su-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourschool.sch.uk" autoComplete="email" style={INPUT} />
            </div>
            <div>
              <label htmlFor="su-pass" style={FIELD_LABEL}>Password</label>
              <input id="su-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" style={INPUT} />
            </div>
          </div>
          <ErrorNote error={error} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
            <Link href="/" style={{ font: "700 16px var(--font-atkinson)", textDecoration: "none", color: "var(--sj-muted)" }}>← Back to storyjar.co.uk</Link>
            <button onClick={goNext} style={PRIMARY}>Continue</button>
          </div>
        </div>
      )}

      {/* ── Step 2: school ── */}
      {step === 2 && (
        <div style={CARD}>
          <div style={STEP_TAG("#D8ECE8", "1.5deg")}>Your school</div>
          <h1 style={H1}>Where do you teach?</h1>
          <p style={LEAD}>This helps us keep your data in the right place — and greet you properly.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 28 }}>
            <div>
              <label htmlFor="su-school" style={FIELD_LABEL}>School name</label>
              <input id="su-school" type="text" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="e.g. St Bede’s Primary" style={INPUT} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <label htmlFor="su-country" style={FIELD_LABEL}>Country</label>
                <select id="su-country" value={country} onChange={(e) => setCountry(e.target.value)} style={INPUT}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="su-year" style={FIELD_LABEL}>Year group you teach</label>
                <select id="su-year" value={yearGroup} onChange={(e) => setYearGroup(e.target.value)} style={INPUT}>
                  {YEAR_GROUPS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          <ErrorNote error={error} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
            <button onClick={goBack} style={BACK}>← Back</button>
            <button onClick={goNext} style={PRIMARY}>Continue</button>
          </div>
        </div>
      )}

      {/* ── Step 3: name the class jar ── */}
      {step === 3 && (
        <div style={CARD}>
          <div style={STEP_TAG("#F7E0E6", "-1deg")}>Your class</div>
          <h1 style={H1}>Name your class jar</h1>
          <p style={LEAD}>Whatever you call yourselves — “2M”, “Hedgehogs”, “Butterflies”.</p>
          <div style={{ marginTop: 28 }}>
            <label htmlFor="su-class" style={FIELD_LABEL}>Class name</label>
            <input id="su-class" type="text" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. Hedgehogs" style={{ ...INPUT, font: "400 22px var(--font-fredoka)", padding: "16px 18px" }} />
          </div>
          <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="52" height="64" viewBox="0 0 100 120" aria-hidden="true">
              <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
              <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="#EAF4F1" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />
            </svg>
            <div style={{ background: "#F3E3C3", border: "3px solid var(--ink)", borderRadius: "8px 14px 14px 8px", padding: "8px 20px 8px 24px", position: "relative", transform: "rotate(-2deg)" }}>
              <div style={{ position: "absolute", left: 8, top: "50%", width: 8, height: 8, border: "3px solid var(--ink)", borderRadius: "50%", transform: "translateY(-50%)", background: "var(--paper)" }} />
              <span style={{ font: "600 21px var(--font-fredoka)", whiteSpace: "nowrap" }}>{classNamePreview}</span>
            </div>
            <span style={{ font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>Your jar’s label</span>
          </div>

          {/* Age mode — asked once. Nothing is pre-ticked: the Children's Code
              forbids nudging a choice that shapes a child's screen, so we don't
              default it. Leaving it uses the younger register. */}
          <fieldset style={{ marginTop: 28, padding: 0, border: "none" }}>
            <legend style={{ ...FIELD_LABEL, padding: 0 }}>Which children is this class for?</legend>
            <p style={{ margin: "4px 0 12px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              This sets how their screens read. You can leave it — younger is used if you do.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                { value: "KS1" as const, label: "Younger children", hint: "Nursery to Year 2" },
                { value: "KS2" as const, label: "Older children", hint: "Years 3 to 6" },
              ].map((o) => (
                <label
                  key={o.value}
                  style={{ flex: 1, minWidth: 220, display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", border: `2px solid ${ageMode === o.value ? "var(--ink)" : "#E6E0D2"}`, borderRadius: 14, cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="su-agemode"
                    value={o.value}
                    checked={ageMode === o.value}
                    onChange={() => setAgeMode(o.value)}
                    style={{ marginTop: 4, width: 20, height: 20 }}
                  />
                  <span>
                    <span style={{ display: "block", font: "700 17px var(--font-fredoka)" }}>{o.label}</span>
                    <span style={{ font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <ErrorNote error={error} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
            <button onClick={goBack} style={BACK}>← Back</button>
            <button onClick={goNext} style={PRIMARY}>Create class</button>
          </div>
        </div>
      )}

      {/* ── Step 4: add children ── */}
      {step === 4 && (
        <div style={CARD}>
          <div style={STEP_TAG("#FBEED3", "1deg")}>Your pupils</div>
          <h1 style={H1}>Add your class list</h1>
          <p style={LEAD}>First names only, one per line — type them or paste straight from your register.</p>
          <div style={{ marginTop: 24 }}>
            <label htmlFor="su-children" style={FIELD_LABEL}>First names</label>
            <textarea id="su-children" rows={8} value={childrenText} onChange={(e) => setChildrenText(e.target.value)} placeholder={"Poppy\nJesse\nAmara\nOliver\n…"} style={{ ...INPUT, font: "400 18px/1.7 var(--font-atkinson)", resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, background: "#D8ECE8", borderRadius: 12, padding: "12px 16px" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="10" fill="#37796f" /><path d="M6.5,11 L9.8,14.5 L15.5,7.5" fill="none" stroke="#FFFDF7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <p style={{ margin: 0, font: "400 15px/1.5 var(--font-atkinson)", color: "var(--ink)" }}>
              <strong>That’s all we need.</strong> No surnames required, no emails, no photos.{" "}
              <span style={{ color: "#2E6B64" }}>{n === 0 ? "" : n === 1 ? "1 pupil so far." : `${n} pupils so far.`}</span>
            </p>
          </div>
          <ErrorNote error={error} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 }}>
            <button onClick={goBack} style={BACK} disabled={pending}>← Back</button>
            <button onClick={goNext} style={{ ...PRIMARY, opacity: pending ? 0.7 : 1 }} disabled={pending}>{pending ? "Creating your jar…" : "Add pupils"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
