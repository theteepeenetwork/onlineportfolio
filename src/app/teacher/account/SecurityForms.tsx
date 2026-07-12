"use client";

import { useActionState } from "react";
import { updateEmail, changePassword } from "@/app/actions/account";

const box: React.CSSProperties = { borderRadius: 16, padding: 20, border: "2px solid var(--calm-border)", background: "var(--paper)" };
const input: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, border: "2px solid var(--calm-border)", background: "var(--cream)", font: "400 16px var(--font-atkinson)", color: "var(--ink)" };
const label: React.CSSProperties = { display: "block", font: "700 14px var(--font-atkinson)", color: "var(--ink)", marginBottom: 6 };

function Feedback({ ok, error, okText }: { ok?: boolean; error?: string; okText: string }) {
  if (error) return <span role="alert" style={{ font: "700 14px var(--font-atkinson)", color: "var(--jam)" }}>{error}</span>;
  if (ok) return <span role="status" style={{ font: "700 14px var(--font-atkinson)", color: "#1f6b3a" }}>{okText}</span>;
  return null;
}

export function SecurityForms({ email }: { email: string }) {
  const [emailState, emailAction, emailPending] = useActionState(updateEmail, {});
  const [pwState, pwAction, pwPending] = useActionState(changePassword, {});

  return (
    <section style={box} aria-labelledby="security-heading">
      <h2 id="security-heading" style={{ margin: 0, font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>Sign-in &amp; security</h2>

      {/* Email */}
      <form action={emailAction} style={{ marginTop: 16 }}>
        <label style={label} htmlFor="acc-email">Email address</label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input id="acc-email" name="email" type="email" defaultValue={email} autoComplete="email" required style={{ ...input, maxWidth: 360 }} />
          <button className="sj-btn-outline" type="submit" disabled={emailPending}>{emailPending ? "Saving…" : "Update email"}</button>
          <Feedback ok={emailState?.ok} error={emailState?.error} okText="Email updated ✓" />
        </div>
      </form>

      <hr style={{ border: "none", borderTop: "2px solid var(--calm-border)", margin: "20px 0" }} />

      {/* Password */}
      <form action={pwAction}>
        <label style={label} htmlFor="acc-current">Change password</label>
        <div style={{ display: "grid", gap: 12, maxWidth: 360 }}>
          <input id="acc-current" name="current" type="password" placeholder="Current password" autoComplete="current-password" required style={input} />
          <input name="next" type="password" placeholder="New password (at least 8 characters)" autoComplete="new-password" required style={input} />
          <input name="confirm" type="password" placeholder="Confirm new password" autoComplete="new-password" required style={input} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
          <button className="sj-btn-outline" type="submit" disabled={pwPending}>{pwPending ? "Saving…" : "Update password"}</button>
          <Feedback ok={pwState?.ok} error={pwState?.error} okText="Password updated ✓" />
        </div>
      </form>
    </section>
  );
}
