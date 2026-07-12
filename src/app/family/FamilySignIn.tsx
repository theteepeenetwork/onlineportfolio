"use client";

import { useActionState, useState } from "react";
import { requestMagicLink, signInWithFamilyCode } from "@/app/actions/family";

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  font: "400 18px var(--font-atkinson)",
  padding: "14px 16px",
  border: "3px solid var(--ink)",
  borderRadius: 12,
  background: "var(--cream)",
  color: "var(--ink)",
};

export function FamilySignIn({ expired }: { expired?: boolean }) {
  const [magic, magicAction, magicPending] = useActionState(requestMagicLink, {});
  const [codeState, codeAction, codePending] = useActionState(signInWithFamilyCode, {});
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="sj" style={{ minHeight: "100vh", background: "var(--paper)", fontFamily: "var(--font-atkinson)", color: "var(--ink)" }}>
      <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1.05fr 0.95fr" }}>
        {/* left: sign-in */}
        <div style={{ padding: "48px 56px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <JarMark size={34} />
            <span style={{ font: "600 24px var(--font-fredoka)" }}>storyjar</span>
            <span style={{ font: "700 12px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", borderRadius: 6, padding: "3px 9px", letterSpacing: "0.05em", textTransform: "uppercase" }}>For families</span>
          </div>

          <div style={{ margin: "auto 0", maxWidth: 400, width: "100%" }}>
            <h1 style={{ margin: 0, font: "600 40px/1.1 var(--font-fredoka)" }}>See your child&apos;s story</h1>
            <p style={{ margin: "14px 0 0", font: "400 18px/1.55 var(--font-atkinson)", color: "var(--ink-soft)" }}>Every drawing, photo and proud little sentence their teacher has added to the jar — gathered in one place, just for you.</p>

            {expired && (
              <p role="alert" style={{ margin: "18px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--jam)", background: "var(--error-tint)", borderRadius: 10, padding: "10px 14px" }}>That link has expired — pop your email in for a fresh one.</p>
            )}

            <form action={magicAction} style={{ marginTop: 30 }}>
              <label htmlFor="pl-email" style={{ display: "block", font: "700 16px var(--font-atkinson)", marginBottom: 6 }}>Email your school has on file</label>
              <input id="pl-email" name="email" type="email" placeholder="you@home.com" required style={INPUT} />
              <button type="submit" disabled={magicPending} style={{ width: "100%", marginTop: 14, font: "700 18px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "none", padding: 15, borderRadius: 999, boxShadow: "0 4px 0 var(--jam-deep)", cursor: "pointer", opacity: magicPending ? 0.7 : 1 }}>{magicPending ? "Sending…" : "Email me a magic link"}</button>
              {magic.error && <p role="alert" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--jam)", background: "var(--error-tint)", borderRadius: 10, padding: "10px 14px" }}>{magic.error}</p>}
              {magic.sent && (
                <p style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", borderRadius: 10, padding: "10px 14px" }}>
                  {/* Neutral by design: identical for known and unknown emails so
                      the form never reveals which addresses are registered. */}
                  ✓ If that email is on file, we&apos;ve sent a one-tap link — check your inbox.{" "}
                  {magic.openUrl && (
                    // A real navigation (not client routing) so the magic-link route can set the session cookie.
                    <a href={magic.openUrl} style={{ color: "#2E6B64", fontWeight: 700, textDecoration: "underline" }}>Open it now →</a>
                  )}
                </p>
              )}
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
              <span style={{ flex: 1, height: 2, background: "var(--calm-border)" }} />
              <span style={{ font: "700 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>OR</span>
              <span style={{ flex: 1, height: 2, background: "var(--calm-border)" }} />
            </div>

            {showCode ? (
              <form action={codeAction}>
                <label htmlFor="pl-code" style={{ display: "block", font: "700 16px var(--font-atkinson)", marginBottom: 6 }}>Family code from your letter</label>
                <input id="pl-code" name="code" placeholder="e.g. FAM123" autoCapitalize="characters" required style={{ ...INPUT, letterSpacing: "0.12em", textTransform: "uppercase" }} />
                <button type="submit" disabled={codePending} style={{ width: "100%", marginTop: 12, font: "700 16px var(--font-atkinson)", color: "var(--ink)", background: "var(--cream)", border: "3px solid var(--ink)", padding: 13, borderRadius: 999, cursor: "pointer" }}>{codePending ? "Signing in…" : "Sign in"}</button>
                {codeState.error && <p role="alert" style={{ margin: "10px 0 0", font: "700 15px var(--font-atkinson)", color: "var(--jam)", background: "var(--error-tint)", borderRadius: 10, padding: "10px 14px" }}>{codeState.error}</p>}
              </form>
            ) : (
              <button onClick={() => setShowCode(true)} style={{ width: "100%", font: "700 16px var(--font-atkinson)", color: "var(--ink)", background: "var(--cream)", border: "3px solid var(--ink)", padding: 13, borderRadius: 999, cursor: "pointer" }}>Use the family code from your letter</button>
            )}
            <p style={{ margin: "20px 0 0", font: "400 14px/1.5 var(--font-atkinson)", color: "var(--sj-muted)" }}>No password needed. You&apos;ll only ever see <strong>your own child</strong> — set up by their school.</p>
          </div>
        </div>

        {/* right: warm illustration panel */}
        <div style={{ background: "#F3E3C3", borderLeft: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <div style={{ transform: "rotate(-3deg)", width: 320, background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 20, padding: 22, boxShadow: "0 10px 0 rgba(34,48,74,0.14)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 44, height: 44, borderRadius: "50%", background: "#E08A9B", display: "flex", alignItems: "center", justifyContent: "center", font: "600 20px var(--font-fredoka)", color: "#FFFDF7" }}>P</span>
              <div>
                <p style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Poppy&apos;s jar</p>
                <p style={{ margin: 0, font: "400 13px var(--font-atkinson)", color: "var(--sj-muted)" }}>12 moments this term</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              {[["#FBEED3", "🌈"], ["#DEEAF3", "🌻"], ["#F7E0E6", "✏️"], ["#E5EED9", "🦖"]].map(([bg, art]) => (
                <div key={art} style={{ aspectRatio: "1", borderRadius: 12, background: bg, border: "2px solid var(--calm-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 }} aria-hidden>{art}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function JarMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" aria-hidden>
      <rect x="26" y="4" width="48" height="14" rx="7" fill="#C9A87C" />
      <path d="M30,20 L70,20 L70,30 C82,36 86,46 86,58 L86,98 Q86,114 70,114 L30,114 Q14,114 14,98 L14,58 C14,46 18,36 30,30 Z" fill="#D8ECE8" stroke="#22304A" strokeWidth="5" strokeLinejoin="round" />
      <rect x="30" y="76" width="16" height="16" rx="3" fill="#C2476B" transform="rotate(-8 38 84)" />
      <rect x="52" y="82" width="16" height="16" rx="3" fill="#F0B441" transform="rotate(6 60 90)" />
    </svg>
  );
}
