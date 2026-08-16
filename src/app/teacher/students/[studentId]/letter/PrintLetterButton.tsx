"use client";

import { Icon } from "@/components/icons/Icon";

export function PrintLetterButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{ font: "700 16px var(--font-atkinson)", color: "var(--ink)", background: "var(--cream)", border: "3px solid var(--ink)", padding: "12px 24px", borderRadius: 999, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
    >
      <Icon name="print" size={18} decorative /> Print the letter
    </button>
  );
}
