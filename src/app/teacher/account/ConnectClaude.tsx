"use client";

import { useActionState, useState } from "react";
import { createToken, revokeToken, disconnectApp } from "@/app/actions/apiTokens";
import { relativeDay } from "@/lib/relativeDay";

// "Connect Claude" — the teacher's own controls for the connector. Shares the
// account page's card shell so it reads as the same product as the rest.

const box: React.CSSProperties = { borderRadius: 18, padding: 20, border: "3px solid var(--ink)", background: "var(--cream)" };
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 12,
  border: "3px solid var(--ink)",
  background: "var(--cream)",
  font: "400 17px var(--font-atkinson)",
  color: "var(--ink)",
};
const label: React.CSSProperties = { display: "block", font: "700 14px var(--font-atkinson)", color: "var(--ink)", marginBottom: 6 };
const rowText: React.CSSProperties = { font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" };

export type TokenRow = { id: string; label: string; hint: string; createdAt: string; lastUsedAt: string | null };
export type AppRow = { id: string; name: string; createdAt: string };

export function ConnectClaude({
  tokens,
  apps,
  mcpUrl,
}: {
  tokens: TokenRow[];
  apps: AppRow[];
  mcpUrl: string;
}) {
  const [state, action, pending] = useActionState(createToken, {});

  return (
    <section style={box} aria-labelledby="connect-heading">
      <h2 id="connect-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>
        Connect Claude
      </h2>
      <p style={{ margin: "8px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--ink)" }}>
        Let Claude build activities in your library — &ldquo;turn this worksheet into a four-page quiz&rdquo;. It can read
        and write your activities and <b>nothing else</b>: not your classes, not your pupils, not their work, not your
        approval queue. Whatever it makes waits in your library until you set it for a class yourself.
      </p>

      {/* claude.ai — nothing to copy, the teacher just adds the connector there. */}
      <h3 style={{ margin: "20px 0 6px", font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>On claude.ai</h3>
      <p style={{ margin: 0, ...rowText }}>
        Add a custom connector and paste this address. You&apos;ll be asked to sign in to StoryJar and approve it.
      </p>
      <Copyable value={mcpUrl} ariaLabel="StoryJar connector address" />

      {apps.length > 0 && (
        <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 8 }}>
          {apps.map((app) => (
            <li key={app.id} style={rowItem}>
              <span style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>{app.name}</span>
              <span style={rowText}>connected {relativeDay(new Date(app.createdAt))}</span>
              <form action={disconnectApp} style={{ marginLeft: "auto" }}>
                <input type="hidden" name="grantId" value={app.id} />
                <button className="sj-btn-outline" type="submit" style={smallBtn}>
                  Disconnect
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <hr style={{ border: "none", borderTop: "2px solid var(--calm-border)", margin: "20px 0" }} />

      {/* Claude Code / Claude Desktop — a token in a header. */}
      <h3 style={{ margin: "0 0 6px", font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>
        In Claude Code or Claude Desktop
      </h3>
      <p style={{ margin: 0, ...rowText }}>Make a token, then run the command it gives you. Keep it like a password.</p>

      <form action={action} style={{ marginTop: 12 }}>
        <label style={label} htmlFor="token-label">
          What&apos;s it for?
        </label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            id="token-label"
            name="label"
            defaultValue="Claude on my laptop"
            maxLength={60}
            style={{ ...input, maxWidth: 320 }}
          />
          <button className="sj-btn-outline" type="submit" disabled={pending}>
            {pending ? "Making…" : "Make a token"}
          </button>
        </div>
        {state?.error ? (
          <p role="alert" style={{ margin: "10px 0 0", font: "700 14px var(--font-atkinson)", color: "var(--jam)" }}>
            {state.error}
          </p>
        ) : null}
      </form>

      {state?.token ? <NewToken token={state.token} mcpUrl={mcpUrl} /> : null}

      {tokens.length > 0 && (
        <ul style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 8 }}>
          {tokens.map((t) => (
            <li key={t.id} style={rowItem}>
              <span style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>{t.label}</span>
              <span style={{ ...rowText, fontFamily: "ui-monospace, monospace" }}>sj_live_{t.hint}…</span>
              <span style={rowText}>
                {t.lastUsedAt ? `last used ${relativeDay(new Date(t.lastUsedAt))}` : "never used"}
              </span>
              <form action={revokeToken} style={{ marginLeft: "auto" }}>
                <input type="hidden" name="tokenId" value={t.id} />
                <button className="sj-btn-outline" type="submit" style={smallBtn}>
                  Revoke
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Shown once, immediately after minting. StoryJar keeps only a hash, so if this
// is lost the answer is a new token — which is said here rather than discovered.
function NewToken({ token, mcpUrl }: { token: string; mcpUrl: string }) {
  const command = `claude mcp add --transport http storyjar ${mcpUrl} --header "Authorization: Bearer ${token}"`;
  return (
    <div
      role="status"
      style={{ marginTop: 14, padding: 16, borderRadius: 14, border: "2px solid var(--ink)", background: "var(--paper)" }}
    >
      <p style={{ margin: "0 0 10px", font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>
        Here it is — copy it now. StoryJar can&apos;t show it again.
      </p>
      <Copyable value={command} ariaLabel="Command to connect Claude Code" />
      <p style={{ margin: "10px 0 0", ...rowText }}>
        In Claude Desktop, add it as a custom connector with the address above and this token as an
        <code style={{ fontFamily: "ui-monospace, monospace" }}> Authorization: Bearer </code> header.
      </p>
    </div>
  );
}

function Copyable({ value, ariaLabel }: { value: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch", marginTop: 10, flexWrap: "wrap" }}>
      <input
        readOnly
        value={value}
        aria-label={ariaLabel}
        onFocus={(e) => e.currentTarget.select()}
        style={{ ...input, flex: "1 1 320px", fontFamily: "ui-monospace, monospace", fontSize: 14 }}
      />
      <button
        className="sj-btn-outline"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard blocked (an insecure origin, or a locked-down school
            // device). The field is selectable, so there is still a way through.
          }
        }}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

const rowItem: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  padding: "10px 14px",
  borderRadius: 12,
  border: "2px solid var(--calm-border)",
};

const smallBtn: React.CSSProperties = { padding: "8px 14px", font: "700 14px var(--font-atkinson)" };
