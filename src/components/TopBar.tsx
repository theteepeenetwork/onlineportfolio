"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutForm } from "@/components/LogoutForm";
import { JarLogo } from "@/components/storyjar/JarLogo";

// The Storyjar bar across the top of every signed-in teacher page.
export function TopBar({
  title,
  subtitle,
  links,
  right,
}: {
  title?: string;
  subtitle?: string;
  links?: { href: string; label: string; badge?: number }[];
  right?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="sj" style={{ background: "var(--cream)", borderBottom: "2px solid var(--calm-border)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20, padding: "14px 24px" }}>
        <Link href="/teacher" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <JarLogo width={22} height={27} />
          <span style={{ font: "600 19px var(--font-fredoka)", color: "var(--ink)" }}>storyjar</span>
        </Link>

        {links && (
          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  style={{
                    font: "700 15px var(--font-atkinson)",
                    textDecoration: "none",
                    borderRadius: 999,
                    padding: "7px 18px",
                    color: active ? "var(--paper)" : "var(--ink-soft)",
                    background: active ? "var(--ink)" : "transparent",
                  }}
                >
                  {l.label}
                  {l.badge ? (
                    <span style={{ background: "var(--jam)", color: "var(--paper)", borderRadius: 999, padding: "1px 8px", fontSize: 13, marginLeft: 6 }}>{l.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {right}
          <LogoutForm>
            <button type="submit" className="sj-btn-outline" style={{ font: "700 14px var(--font-atkinson)", padding: "8px 18px" }}>Sign out</button>
          </LogoutForm>
        </div>
      </div>

      {(title || subtitle) && (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4px 24px 18px" }}>
          {title && <h1 style={{ margin: 0, font: "600 30px var(--font-fredoka)", color: "var(--ink)" }}>{title}</h1>}
          {subtitle && <p style={{ margin: "4px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>{subtitle}</p>}
        </div>
      )}
    </header>
  );
}
