"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { reportClientError } from "@/components/ClientErrorReporter";

// The child's own boundary for anything under /student that fails while it is
// being drawn (FINDINGS F74). Without it a child meets the framework's default
// page, which reads at adult level and offers nothing to tap.
//
// Two ways out, both at the child touch floor (SAFEGUARDING rule 18): have
// another go on the same page, or go back to the jar. Styled like
// not-found.tsx, and like it hardcodes the younger register — a boundary has no
// session to read, and the safer wording is the right default when the
// register is unknown. The words "Have another go" are the younger register's
// retry (docs/AGE_MODE_COPY.md); the persona sweep judges a way out by the
// accessible name, so they are the whole button text.
//
// It says nothing about what happened. The failure is reported by class name
// and place, never by its text, through the same reporter as everything else.
export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "boundary");
  }, [error]);

  const pill: React.CSSProperties = {
    minHeight: 64,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    font: "600 clamp(18px, 2.6vw, 24px) var(--font-fredoka)",
    color: "var(--paper)",
    background: "var(--jam)",
    border: "3px solid var(--ink)",
    borderRadius: 999,
    padding: "14px 40px",
    textDecoration: "none",
    boxShadow: "0 5px 0 var(--jam-deep)",
    cursor: "pointer",
  };

  return (
    <div
      className="sj"
      data-ks="KS1"
      style={{
        fontFamily: "var(--font-atkinson)",
        color: "var(--ink)",
        background: "var(--paper)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px 20px",
      }}
    >
      <h1
        style={{
          margin: "0 0 12px",
          font: "600 clamp(36px, 6vw, 52px) var(--font-fredoka)",
          color: "#37796f",
        }}
      >
        Oops! Something went wobbly.
      </h1>
      <p
        style={{
          margin: "0 0 32px",
          font: "400 clamp(18px, 2.8vw, 24px)/1.5 var(--font-atkinson)",
          color: "var(--ink-soft)",
          maxWidth: 440,
        }}
      >
        Tap the button to have another go. Your teacher can help if it keeps happening.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
        <button type="button" onClick={reset} style={pill}>
          <Icon name="redo" size={28} decorative />
          Have another go
        </button>
        <Link href="/student" style={pill}>
          <Icon name="jar" size={28} decorative />
          Back to my jar
        </Link>
      </div>
    </div>
  );
}
