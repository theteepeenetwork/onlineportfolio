"use client";

import { useEffect } from "react";
import { clearMarkedDraft } from "@/lib/draftStore";

// Mounted on the pages you land on after a successful save/submit. Deletes the
// local draft that was marked for clearing just before the redirect. No-ops if
// nothing was marked, so it's safe to render unconditionally.
export function ClearMarkedDraft() {
  useEffect(() => {
    void clearMarkedDraft();
  }, []);
  return null;
}
