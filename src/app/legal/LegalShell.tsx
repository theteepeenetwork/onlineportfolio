import Link from "next/link";
import { JarLogo } from "@/components/storyjar/JarLogo";

export { POLICIES, policyStatus } from "./policies";
export type { PolicyStatus } from "./policies";
import { POLICIES, policyStatus } from "./policies";

// Shared chrome for the /legal/* pages: StoryJar nav, the "draft" banner where
// it still applies, a readable column, and a cross-linking footer.
//
// Pass `policyKey` — the route segment — and the shell decides the banner from
// POLICIES. A page that passes nothing is treated as a draft.
// `directoryPage` is for /legal itself, which is a list of policies rather than
// a policy. It is the only way to render this shell without a key and without a
// banner, and it exists so that a policy page cannot quietly opt itself out:
// a policy's banner is decided by POLICIES and nothing else.
export function LegalShell({
  title,
  policyKey,
  directoryPage = false,
  updated,
  intro,
  children,
}: {
  title: string;
  policyKey?: string;
  directoryPage?: boolean;
  updated?: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const isDraft = !directoryPage && policyStatus(policyKey) === "draft";
  const lastUpdated = updated ?? (isDraft ? "Draft — not yet published" : "5 September 2026");
  return (
    <div className="sj" style={{ minHeight: "100vh", background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-atkinson)", display: "flex", flexDirection: "column" }}>
      <nav style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 32px", maxWidth: 820, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "var(--ink)" }}>
          <JarLogo width={26} height={32} />
          <span style={{ font: "600 22px var(--font-fredoka)" }}>storyjar</span>
        </Link>
        <Link href="/legal" style={{ marginLeft: "auto", font: "700 14px var(--font-atkinson)", color: "var(--ink-soft)", textDecoration: "none" }}>All policies →</Link>
      </nav>

      <main style={{ flex: 1, maxWidth: 820, margin: "0 auto", width: "100%", padding: "12px 32px 64px", boxSizing: "border-box" }}>
        {/* Draft / not-legal-advice banner — carried by every policy that POLICIES
            still marks as a draft. Removing it from a page is a statement that a
            school may rely on it, so it is governed by the table, not by the page. */}
        {isDraft && (
          <div role="note" style={{ background: "var(--honey-tint)", border: "2px solid var(--honey)", borderRadius: 14, padding: "14px 18px", margin: "0 0 26px" }}>
            <p style={{ margin: 0, font: "700 15px var(--font-atkinson)", color: "var(--honey-ink)" }}>⚠️ Draft for review — not legal advice.</p>
            <p style={{ margin: "6px 0 0", font: "400 14px/1.5 var(--font-atkinson)", color: "var(--honey-ink)" }}>
              This is a working draft. It has not yet been reviewed by a qualified data-protection or education-law professional, and it should not be relied upon until it has been. Our published policies are listed on the <Link href="/legal">policies page</Link>.
            </p>
          </div>
        )}

        <h1 style={{ margin: 0, font: "600 40px/1.1 var(--font-fredoka)" }}>{title}</h1>
        <p style={{ margin: "10px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>Last updated: {lastUpdated}</p>
        {intro && <p style={{ margin: "18px 0 0", font: "400 18px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>{intro}</p>}

        <div className="legal-prose" style={{ marginTop: 24 }}>{children}</div>
      </main>

      <footer style={{ background: "#22304A", color: "#C4CDDD", padding: "40px 32px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <p style={{ margin: "0 0 14px", font: "600 16px var(--font-fredoka)", color: "#FAF6EE" }}>StoryJar policies</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px" }}>
            {POLICIES.map((p) => (
              <Link key={p.key} href={`/legal/${p.key}`} style={{ font: "400 14px var(--font-atkinson)", color: "#A9B4C9", textDecoration: "none" }}>{p.label}</Link>
            ))}
          </div>
          <p style={{ margin: "22px 0 0", font: "400 13px var(--font-atkinson)", color: "#6B7690" }}>
            StoryJar acts as a data processor for schools (the data controller). © 2026 StoryJar · storyjar.co.uk
          </p>
        </div>
      </footer>
    </div>
  );
}
