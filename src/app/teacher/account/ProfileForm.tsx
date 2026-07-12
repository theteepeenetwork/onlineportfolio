"use client";

import { useActionState, useState } from "react";
import { updateProfile } from "@/app/actions/account";
import { deriveTeacherName, type DisplayStyle } from "@/lib/teacherName";

const TITLES = ["Mr", "Miss", "Mrs", "Ms", "Mx", ""];
const COUNTRIES = ["England", "Scotland", "Wales", "Northern Ireland", "Elsewhere"];

const box: React.CSSProperties = { borderRadius: 16, padding: 20, border: "2px solid var(--calm-border)", background: "var(--paper)" };
const input: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "2px solid var(--calm-border)", background: "var(--cream)", font: "400 16px var(--font-atkinson)", color: "var(--ink)" };
const label: React.CSSProperties = { display: "block", font: "700 14px var(--font-atkinson)", color: "var(--ink)", marginBottom: 6 };

function tile(active: boolean): React.CSSProperties {
  return {
    flex: "1 1 160px", textAlign: "left", cursor: "pointer",
    borderRadius: 12, padding: "12px 16px",
    border: `2px solid ${active ? "var(--ink)" : "var(--calm-border)"}`,
    background: active ? "var(--cream)" : "var(--paper)",
    font: "700 16px var(--font-atkinson)", color: "var(--ink)",
  };
}

export function ProfileForm({
  fullName: initName,
  title: initTitle,
  displayStyle: initStyle,
  school: initSchool,
  country: initCountry,
}: {
  fullName: string;
  title: string;
  displayStyle: DisplayStyle;
  school: string;
  country: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, {});
  const [fullName, setFullName] = useState(initName);
  const [title, setTitle] = useState(initTitle);
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>(initStyle);

  const { formalName, firstNamePreview, displayName } = deriveTeacherName({ title, fullName, displayStyle });
  const greeting = displayName || "there";

  return (
    <form action={action} style={box} aria-labelledby="profile-heading">
      <h2 id="profile-heading" style={{ margin: 0, font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>Your details</h2>
      <p style={{ margin: "6px 0 18px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        How you appear in Storyjar. Children never have accounts — this is just you.
      </p>

      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 14 }}>
          <div>
            <label style={label} htmlFor="acc-title">Title</label>
            <select id="acc-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} style={input}>
              {TITLES.map((t) => <option key={t} value={t}>{t === "" ? "Prefer not to say" : t}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="acc-name">Full name</label>
            <input id="acc-name" name="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required style={input} />
          </div>
        </div>

        <div>
          <span style={label}>What your class calls you</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setDisplayStyle("formal")} aria-pressed={displayStyle === "formal"} style={tile(displayStyle === "formal")}>
              {formalName || "Mr Pearson"}
              <span style={{ display: "block", font: "400 13px var(--font-atkinson)", color: "var(--ink-soft)", marginTop: 2 }}>Title &amp; surname</span>
            </button>
            <button type="button" onClick={() => setDisplayStyle("first")} aria-pressed={displayStyle === "first"} style={tile(displayStyle === "first")}>
              {firstNamePreview || "Sam"}
              <span style={{ display: "block", font: "400 13px var(--font-atkinson)", color: "var(--ink-soft)", marginTop: 2 }}>First name</span>
            </button>
          </div>
          <input type="hidden" name="displayStyle" value={displayStyle} />
          <p style={{ margin: "8px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            Your class is greeted with <strong>“Hello {greeting}”</strong>.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 14 }}>
          <div>
            <label style={label} htmlFor="acc-school">School name</label>
            <input id="acc-school" name="school" type="text" defaultValue={initSchool} placeholder="e.g. St Bede’s Primary" style={input} />
          </div>
          <div>
            <label style={label} htmlFor="acc-country">Country</label>
            <select id="acc-country" name="country" defaultValue={initCountry || "England"} style={input}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
        <button className="btn-brand" type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
        {state?.ok && <span role="status" style={{ font: "700 14px var(--font-atkinson)", color: "#1f6b3a" }}>Saved ✓</span>}
        {state?.error && <span role="alert" style={{ font: "700 14px var(--font-atkinson)", color: "var(--jam)" }}>{state.error}</span>}
      </div>
    </form>
  );
}
