import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

// Safety-net boundary for any notFound() call inside the /student subtree.
//
// The primary fix is the redirect-instead-of-notFound pattern at the two known
// throw sites (new/[type]/page.tsx and activities/[id]/page.tsx). This boundary
// is the backstop: if a new call to notFound() appears anywhere under /student
// without its own boundary, a child sees this page instead of the framework's
// default "404 | This page could not be found." — which reads at adult level and
// has no way back to the jar.
//
// Styled to match the child register: Fredoka heading, Atkinson body, the jar's
// paper/jam palette, and a tappable 64px link (child touch floor, SAFEGUARDING
// rule 18). No age-mode look-up here because there is no user session to read —
// the safer, younger wording is the right default when the register is unknown.
export default function StudentNotFound() {
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
        Hmm, we can&apos;t find that page!
      </h1>
      <p
        style={{
          margin: "0 0 32px",
          font: "400 clamp(18px, 2.8vw, 24px)/1.5 var(--font-atkinson)",
          color: "var(--ink-soft)",
          maxWidth: 440,
        }}
      >
        That link didn&apos;t work. Tap the button below to go back to your jar.
      </p>
      <Link
        href="/student"
        style={{
          minHeight: 64,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          font: "600 clamp(18px, 2.6vw, 24px) var(--font-fredoka)",
          color: "var(--paper)",
          background: "var(--jam)",
          border: "3px solid var(--ink)",
          borderRadius: 999,
          padding: "14px 40px",
          textDecoration: "none",
          boxShadow: "0 5px 0 var(--jam-deep)",
        }}
      >
        <Icon name="jar" size={28} decorative />
        Back to my jar
      </Link>
    </div>
  );
}
