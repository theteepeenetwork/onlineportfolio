"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

// The class code and its QR, one tap from the class header on Journals. A
// teacher trying StoryJar in a school asked how you find the code: the small
// pill in the header did not read as "this is what the children type", and
// the printable sheet is two screens away under Manage class. This puts both
// where the class is, big enough to hold up to a room or scan from a tablet.
export function ClassCodeReveal({
  className,
  code,
  qrSrc,
  printHref,
}: {
  className: string;
  code: string;
  qrSrc: string;
  printHref: string;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          background: "var(--cream)",
          border: "2px solid var(--ink)",
          borderRadius: 8,
          padding: "3px 10px 3px 12px",
          color: "var(--ink)",
          cursor: "pointer",
          minHeight: 36,
        }}
      >
        <span style={{ font: "700 15px ui-monospace, Menlo, monospace", letterSpacing: ".08em" }}>{code}</span>
        <span style={{ font: "700 13px var(--font-atkinson)", color: "var(--sj-muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="search" size={15} decorative /> Show code &amp; QR
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Class code and QR for ${className}`}
          onClick={close}
          // Opaque, not dimmed: this goes up on the classroom board, and the
          // rest of the teacher's dashboard (the queue, names, who is waiting)
          // must not be readable behind it.
          style={{ position: "fixed", inset: 0, background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="sj-card" style={{ maxWidth: 520, width: "100%", padding: "26px 26px 24px", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 4px", font: "600 24px var(--font-fredoka)", color: "var(--ink)" }}>{className}&rsquo;s class code</h3>
            <p style={{ margin: "0 0 18px", font: "400 15px/1.5 var(--font-atkinson)", color: "var(--ink-soft)" }}>
              Pupils type this code to sign in, or scan the square to jump straight there.
            </p>
            <p style={{ margin: "0 0 18px", font: "700 56px/1 var(--font-fredoka)", letterSpacing: "0.16em", color: "var(--ink)" }}>{code}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={`QR code that opens the sign-in page for ${className}`}
              width={220}
              height={220}
              style={{ display: "block", margin: "0 auto 20px", background: "#FFFDF7", border: "3px solid var(--ink)", borderRadius: 16, padding: 16, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Link
                href={printHref}
                style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink)", background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 999, padding: "10px 20px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <Icon name="print" size={18} decorative /> Print for the classroom door
              </Link>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                style={{ font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "3px solid var(--ink)", borderRadius: 999, padding: "10px 22px", cursor: "pointer", boxShadow: "0 3px 0 var(--jam-deep)" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
