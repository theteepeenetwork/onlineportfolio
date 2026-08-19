"use client";

import { useActionState, useState } from "react";
import { addChildWithFamilyCode, saveFamilyDetails } from "@/app/actions/family";
import type { ParentSession } from "@/lib/parentAuth";

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

const CARD: React.CSSProperties = {
  background: "var(--cream)",
  border: "2px solid var(--calm-border)",
  borderRadius: 16,
  padding: "20px 22px",
};

const NOTE: React.CSSProperties = {
  margin: "8px 0 0",
  font: "400 14px/1.55 var(--font-atkinson)",
  color: "var(--sj-muted)",
};

function Message({ text, tone }: { text: string; tone: "good" | "bad" }) {
  const good = tone === "good";
  return (
    <p
      role={good ? undefined : "alert"}
      style={{ margin: "10px 0 0", font: "700 15px var(--font-atkinson)", color: good ? "#2E6B64" : "var(--jam)", background: good ? "var(--glass-light)" : "var(--error-tint)", borderRadius: 10, padding: "10px 14px" }}
    >
      {text}
    </p>
  );
}

// The two things a parent can change about their own family space.
//
// Both live here rather than anywhere in the teacher's half of the product, and
// that placement is the design:
//
//  - Adding a sibling is the ONLY way two children end up behind one sign-in.
//    The two children may be taught by two teachers who must never see each
//    other's classes, so the join has to be made by the one person holding both
//    letters (SAFEGUARDING rules 4 and 6).
//  - The email box is the only place an address is ever typed. A teacher is
//    never asked for one and could not add one if they wanted to, so StoryJar
//    holds no way of contacting a parent unless the parent put it here.
//
// Neither is pushed. The section sits below the child's work, closed, and says
// plainly what each field is for and that leaving it empty is fine.
export function FamilySettings({ parent }: { parent: ParentSession }) {
  const [open, setOpen] = useState(false);
  const [added, addAction, adding] = useActionState(addChildWithFamilyCode, {});
  const [saved, saveAction, savingDetails] = useActionState(saveFamilyDetails, {});

  return (
    <section style={{ marginTop: 34 }} aria-labelledby="family-settings-heading">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ font: "700 16px var(--font-atkinson)", color: "var(--ink)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
      >
        <span id="family-settings-heading">Your family space</span> {open ? "▴" : "▾"}
      </button>

      {open && (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", marginTop: 14 }}>
          <div style={CARD}>
            <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Add another child</h2>
            <p style={NOTE}>
              Got a letter for a brother or sister? Type that code here and both children will sit
              behind this one sign-in. It works even if they are in different classes.
            </p>
            <form action={addAction} style={{ marginTop: 12 }}>
              <label htmlFor="add-code" style={{ display: "block", font: "700 15px var(--font-atkinson)", marginBottom: 6 }}>
                Family code from their letter
              </label>
              <input
                id="add-code"
                name="code"
                autoCapitalize="characters"
                autoComplete="off"
                required
                style={{ ...INPUT, letterSpacing: "0.12em", textTransform: "uppercase" }}
              />
              <button
                type="submit"
                disabled={adding}
                style={{ width: "100%", marginTop: 12, font: "700 16px var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", border: "3px solid var(--ink)", padding: 12, borderRadius: 999, cursor: "pointer", opacity: adding ? 0.7 : 1 }}
              >
                {adding ? "Adding…" : "Add this child"}
              </button>
            </form>
            {added.error && <Message text={added.error} tone="bad" />}
            {added.added && <Message text={`✓ ${added.added} is in your family space now.`} tone="good" />}
          </div>

          <div style={CARD}>
            <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Sign in without the code</h2>
            <p style={NOTE}>
              If you would rather not keep the letter, add your email and we can send you a one-tap
              link instead. It is up to you. We only ever use it to send you that link, and you can
              take it off again by clearing the box.
            </p>
            <form action={saveAction} style={{ marginTop: 12 }}>
              <label htmlFor="family-name" style={{ display: "block", font: "700 15px var(--font-atkinson)", marginBottom: 6 }}>
                Your name (optional)
              </label>
              <input id="family-name" name="name" defaultValue={parent.name ?? ""} autoComplete="name" style={INPUT} />

              <label htmlFor="family-email" style={{ display: "block", font: "700 15px var(--font-atkinson)", margin: "12px 0 6px" }}>
                Your email (optional)
              </label>
              <input
                id="family-email"
                name="email"
                type="email"
                defaultValue={parent.email ?? ""}
                autoComplete="email"
                style={INPUT}
              />

              <button
                type="submit"
                disabled={savingDetails}
                style={{ width: "100%", marginTop: 12, font: "700 16px var(--font-atkinson)", color: "var(--ink)", background: "var(--paper)", border: "3px solid var(--ink)", padding: 12, borderRadius: 999, cursor: "pointer", opacity: savingDetails ? 0.7 : 1 }}
              >
                {savingDetails ? "Saving…" : "Save"}
              </button>
            </form>
            {saved.error && <Message text={saved.error} tone="bad" />}
            {saved.saved && <Message text="✓ Saved." tone="good" />}
          </div>
        </div>
      )}
    </section>
  );
}
