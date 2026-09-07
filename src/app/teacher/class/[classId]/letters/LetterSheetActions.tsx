"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons/Icon";
import { createMissingFamilyCodes } from "@/app/actions/familyAccess";

// The two buttons above the pile of letters, and the one sentence that tells a
// teacher what they are about to print.
//
// The order matters: minting comes FIRST when anyone is missing a code, because
// printing a sheet that quietly leaves four children out is the failure this
// whole feature exists to prevent. Once nobody is missing, the mint button is
// gone rather than disabled, so the page settles into a single obvious action.
const BTN_BASE = {
  font: "700 16px var(--font-atkinson)",
  border: "3px solid var(--ink)",
  padding: "12px 24px",
  borderRadius: 999,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
} as const;

export function LetterSheetActions({
  classId,
  letterCount,
  missingCount,
  frozen,
}: {
  classId: string;
  letterCount: number;
  missingCount: number;
  frozen: boolean;
}) {
  const [state, mintAction, minting] = useActionState(createMissingFamilyCodes, {});

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {missingCount > 0 && !frozen && (
        <form action={mintAction}>
          <input type="hidden" name="classId" defaultValue={classId} />
          <button type="submit" disabled={minting} style={{ ...BTN_BASE, color: "var(--paper)", background: "var(--jam)", opacity: minting ? 0.7 : 1 }}>
            <Icon name="add-to-jar" size={18} decorative />
            {minting
              ? "Making codes…"
              : `Make codes for the ${missingCount} without one`}
          </button>
        </form>
      )}

      {letterCount > 0 && (
        <button onClick={() => window.print()} style={{ ...BTN_BASE, color: "var(--ink)", background: "var(--cream)" }}>
          <Icon name="print" size={18} decorative />
          Print all {letterCount} letters
        </button>
      )}

      {state.error && (
        <p role="alert" style={{ margin: 0, font: "700 15px var(--font-atkinson)", color: "var(--jam)" }}>
          {state.error}
        </p>
      )}
      {typeof state.created === "number" && state.created > 0 && (
        <p role="status" style={{ margin: 0, font: "700 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>
          {state.created === 1 ? "One new code added below." : `${state.created} new codes added below.`}
        </p>
      )}
    </div>
  );
}
