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
      {/* 44px, not the 18 this used to be. It is the ONLY control on the banner
          a frozen school sees on every screen — the one thing a business manager
          is here to press, at the moment she is already cross about it. Measured
          at 137×18 by the persona team; the rest of that list is F49. Outside
          the shell's `data-shell` regions, so the touch-target gate does not
          cover it: this comment is the guard. */}
      <Link
        href="/teacher/account"
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 44,
          padding: "0 10px",
          borderRadius: 10,
          color: "var(--paper, #fff)",
          textDecoration: "underline",
          fontWeight: 800,
        }}
      >
        Renew your plan →
      </Link>
    </div>
  );
}
