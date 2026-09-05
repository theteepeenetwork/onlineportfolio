// The policy table, in a module of its own so that a test can import it
// without pulling next/link and the whole page shell into a node process.
// LegalShell re-exports it, so existing imports keep working.
//
// Every policy in one place, so the shell can cross-link them and the footer can
// list them. `key` is the route segment under /legal.
//
// `status` is the single source of truth for the draft banner. A page is
// "published" only when everything `docs/policy-readiness.md` lists against it
// is real. The operational pages became publishable on 5 September 2026, when
// the legal entity, the published address, the ICO registration and the backup
// region were all settled. Terms and the DPA stay draft because they still want
// S1 (liability drafting) and S2 (a signable Art. 28(3) agreement), and
// acceptable-use rides with them.
//
// Deny by default: a page this table does not name as published carries the
// banner. Adding a page and forgetting to classify it fails safe.
export type PolicyStatus = "draft" | "published";

export const POLICIES: { key: string; label: string; status: PolicyStatus }[] = [
  { key: "privacy", label: "Privacy Policy", status: "published" },
  { key: "privacy-for-families", label: "Privacy — plain English", status: "published" },
  { key: "cookies", label: "Cookie Policy", status: "published" },
  { key: "safeguarding", label: "Safeguarding & Child Protection", status: "published" },
  { key: "terms", label: "Terms of Service", status: "draft" },
  { key: "acceptable-use", label: "Acceptable Use Policy", status: "draft" },
  { key: "data-processing", label: "Data Processing Agreement", status: "draft" },
  { key: "sub-processors", label: "Sub-processors", status: "published" },
  { key: "accessibility", label: "Accessibility Statement", status: "published" },
];

export function policyStatus(key?: string): PolicyStatus {
  if (!key) return "draft";
  return POLICIES.find((p) => p.key === key)?.status ?? "draft";
}
