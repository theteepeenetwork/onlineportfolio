import Link from "next/link";
import { LegalShell, POLICIES } from "./LegalShell";

export const metadata = { title: "Policies — Storyjar" };

const BLURB: Record<string, string> = {
  privacy: "How Storyjar handles personal data, and the roles of school, teacher, parent and Storyjar.",
  "privacy-for-families": "The short, plain-English version for parents and carers.",
  cookies: "What cookies Storyjar sets (essential only) and why.",
  safeguarding: "How Storyjar is built to keep children safe, and how to raise a concern.",
  terms: "The agreement between a school and Storyjar for using the service.",
  "acceptable-use": "What may and may not be put into Storyjar.",
  "data-processing": "The processor terms: how Storyjar handles data on a school's behalf.",
  "sub-processors": "The third parties Storyjar relies on, and where data is held.",
  accessibility: "Storyjar's commitment to being usable by every child and adult.",
};

export default function LegalIndex() {
  return (
    <LegalShell title="Policies" updated="Draft — under review" intro="Storyjar is a class journal for children aged 3–7. Because it holds children's work, safeguarding and data protection sit at its core. These policies explain how it works and how we protect the people who use it.">
      <p>
        In data-protection law the <strong>school is the data controller</strong> and{" "}
        <strong>Storyjar is a data processor</strong> acting on the school&apos;s instructions.
        Each policy below reflects that relationship.
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
        {POLICIES.map((p) => (
          <Link key={p.key} href={`/legal/${p.key}`} className="sj-card" style={{ display: "block", padding: "16px 18px", textDecoration: "none", color: "var(--ink)" }}>
            <p style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>{p.label} →</p>
            {BLURB[p.key] && <p style={{ margin: "4px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>{BLURB[p.key]}</p>}
          </Link>
        ))}
      </div>
    </LegalShell>
  );
}
