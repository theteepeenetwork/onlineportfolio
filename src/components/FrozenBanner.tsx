import Link from "next/link";

// Shown across the teacher area when the governing account is FROZEN (read-only).
// This is a courtesy signal only — the real enforcement is server-side in
// requireWritableAccount(). Viewing and downloading stay available.
export function FrozenBanner() {
  return (
    <div
      role="status"
      className="sj"
      style={{
        background: "var(--jam, #9a3b52)",
        color: "var(--paper, #fff)",
        padding: "10px 24px",
        font: "600 15px var(--font-atkinson)",
        textAlign: "center",
      }}
    >
      Your plan has paused, so the class jar is <strong>read-only</strong> — you can still view and download work.{" "}
      <Link href="/teacher/account" style={{ color: "var(--paper, #fff)", textDecoration: "underline", fontWeight: 800 }}>
        Renew your plan →
      </Link>
    </div>
  );
}
