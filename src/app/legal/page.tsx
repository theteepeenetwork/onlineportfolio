import Link from "next/link";
import { LegalShell, POLICIES } from "./LegalShell";

export const metadata = { title: "Policies — StoryJar" };

const BLURB: Record<string, string> = {
  privacy: "How StoryJar handles personal data, and the roles of school, teacher, parent and StoryJar.",
  "privacy-for-families": "The short, plain-English version for parents and carers.",
  cookies: "What cookies StoryJar sets (essential only) and why.",
  safeguarding: "How StoryJar is built to keep children safe, and how to raise a concern.",
  terms: "The agreement between a school and StoryJar for using the service.",
  "acceptable-use": "What may and may not be put into StoryJar.",
  "data-processing": "The processor terms: how StoryJar handles data on a school's behalf.",
  "sub-processors": "The third parties StoryJar relies on, and where data is held.",
  accessibility: "StoryJar's commitment to being usable by every child and adult.",
};

export default function LegalIndex() {
  return (
    <LegalShell title="Policies" directoryPage updated="5 September 2026" intro="StoryJar is a class journal for children aged 3–11. Because it holds children's work, safeguarding and data protection sit at its core. These policies explain how it works and how we protect the people who use it.">
      <p>
        In data-protection law the <strong>school is the data controller</strong> and{" "}
        <strong>StoryJar is a data processor</strong> acting on the school&apos;s instructions.
        Each policy below reflects that relationship.
      </p>
      <p>
        Policies marked <strong>Draft</strong> are still being worked on and should not be relied upon yet. The
        Terms of Service and the Data Processing Agreement are the two in that state. If your office needs a
        signable Article 28 agreement before those are finished, ask us and we will tell you where it stands.
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {POLICIES.map((p) => (
          <Link key={p.key} href={`/legal/${p.key}`} className="sj-card" style={{ display: "block", padding: "16px 18px", textDecoration: "none", color: "var(--ink)" }}>
            <p style={{ margin: 0, font: "600 18px var(--font-fredoka)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>{p.label} →</span>
              {p.status === "draft" && (
                <span style={{ font: "700 12px var(--font-atkinson)", color: "var(--honey-ink)", background: "var(--honey-tint)", border: "1px solid var(--honey)", borderRadius: 999, padding: "2px 10px" }}>
                  Draft
                </span>
              )}
            </p>
            {BLURB[p.key] && <p style={{ margin: "4px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>{BLURB[p.key]}</p>}
          </Link>
        ))}
      </div>
    </LegalShell>
  );
}
