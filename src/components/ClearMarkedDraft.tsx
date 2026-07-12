"use client";

import { useEffect } from "react";
import { clearMarkedDraft } from "@/lib/draftStore";
import { serverDiscardDraft } from "@/lib/draftSync";

// Mounted on the pages you land on after a successful save/submit. Deletes the
// local draft that was marked for clearing just before the redirect, AND the
// cross-device server copy. No-ops if nothing was marked, so it's safe to render
// unconditionally.
export function ClearMarkedDraft() {
  useEffect(() => {
    void (async () => {
      const info = await clearMarkedDraft();
      if (info?.surface && info?.contextKey) await serverDiscardDraft(info.surface, info.contextKey);
    })();
  }, []);
  return null;
}
