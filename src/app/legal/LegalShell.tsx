import Link from "next/link";
import { JarLogo } from "@/components/storyjar/JarLogo";

// Every policy in one place, so the shell can cross-link them and the footer can
// list them. `key` is the route segment under /legal.
export const POLICIES: { key: string; label: string }[] = [
  { key: "privacy", label: "Privacy Policy" },
  { key: "privacy-for-families", label: "Privacy — plain English" },
  { key: "cookies", label: "Cookie Policy" },
  { key: "safeguarding", label: "Safeguarding & Child Protection" },
  { key: "terms", label: "Terms of Service" },
  { key: "acceptable-use", label: "Acceptable Use Policy" },
  { key: "data-processing", label: "Data Processing Agreement" },
  { key: "sub-processors", label: "Sub-processors" },
  { key: "accessibility", label: "Accessibility Statement" },
];

// Shared chrome for the /legal/* pages: Storyjar nav, a prominent "draft"
// banner, a readable column, and a cross-linking footer.
export function LegalShell({
  title,
  updated = "Draft — not yet published",
  intro,
  children,
}: {
  title: string;
  updated?: string;
  intro?: string;
  children: React.ReactNode;
}) {
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
        {/* Draft / not-legal-advice banner — required on every policy until reviewed. */}
        <div role="note" style={{ background: "var(--honey-tint)", border: "2px solid var(--honey)", borderRadius: 14, padding: "14px 18px", margin: "0 0 26px" }}>
          <p style={{ margin: 0, font: "700 15px var(--font-atkinson)", color: "var(--honey-ink)" }}>⚠️ Draft for review — not legal advice.</p>
          <p style={{ margin: "6px 0 0", font: "400 14px/1.5 var(--font-atkinson)", color: "var(--honey-ink)" }}>
            This is a working draft. It must be reviewed and approved by a qualified data-protection / education-law professional and the responsible Data Protection Officer before it is published or relied upon. Placeholders in <code>[square brackets]</code> need real values.
          </p>
        </div>

        <h1 style={{ margin: 0, font: "600 40px/1.1 var(--font-fredoka)" }}>{title}</h1>
        <p style={{ margin: "10px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>Last updated: {updated}</p>
        {intro && <p style={{ margin: "18px 0 0", font: "400 18px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>{intro}</p>}

        <div className="legal-prose" style={{ marginTop: 24 }}>{children}</div>
      </main>

      <footer style={{ background: "#22304A", color: "#C4CDDD", padding: "40px 32px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <p style={{ margin: "0 0 14px", font: "600 16px var(--font-fredoka)", color: "#FAF6EE" }}>Storyjar policies</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px" }}>
            {POLICIES.map((p) => (
              <Link key={p.key} href={`/legal/${p.key}`} style={{ font: "400 14px var(--font-atkinson)", color: "#A9B4C9", textDecoration: "none" }}>{p.label}</Link>
            ))}
          </div>
          <p style={{ margin: "22px 0 0", font: "400 13px var(--font-atkinson)", color: "#6B7690" }}>
            Storyjar acts as a data processor for schools (the data controller). © 2026 Storyjar · storyjar.co.uk
          </p>
        </div>
      </footer>
    </div>
  );
}
