"use client";

// The account area's card shell and its one-line notice, in one place.
//
// Both were defined inside BillingPanel.tsx until the school-purchase section
// became a component of its own. Importing them back OUT of BillingPanel would
// have made the two files import each other, so they live here instead — which
// is also what stops a second copy of the 3px outline drifting away from the
// first the next time a radius changes.

/**
 * The teacher area's card: a 3px ink outline and an 18px radius, so a settings
 * page reads as the same product as the register.
 */
export const box: React.CSSProperties = {
  borderRadius: 18,
  padding: 20,
  border: "3px solid var(--ink)",
  background: "var(--cream)",
};

/**
 * A short piece of news about something that just happened — a purchase, a
 * refusal, a cancelled checkout.
 *
 * `role="status"` rather than `role="alert"`: this is announced politely when a
 * screen reader gets to it, because none of it interrupts what the person is
 * doing. The refusals it carries are answers to a button that has already been
 * pressed, not validation of something still being typed.
 */
export function Notice({ tone, children }: { tone: "good" | "warn" | "info"; children: React.ReactNode }) {
  const bg = tone === "good" ? "#e8f5ec" : tone === "warn" ? "#fdecef" : "#eef4f8";
  const fg = tone === "good" ? "#1f6b3a" : tone === "warn" ? "#9a3b52" : "#2b5c74";
  return (
    <p
      role="status"
      style={{
        ...box,
        borderRadius: 16,
        background: bg,
        color: fg,
        border: "none",
        font: "600 15px var(--font-atkinson)",
        margin: "0 0 16px",
      }}
    >
      {children}
    </p>
  );
}
