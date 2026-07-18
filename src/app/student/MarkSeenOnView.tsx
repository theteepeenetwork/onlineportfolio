"use client";

import { useEffect } from "react";
import { markJarSeen } from "@/app/actions/journal";

// For older (journal) children there is no jar to drop a moment into, so the
// "I've looked" signal that JarStatus fires for younger children (M2) has no
// home. This headless component fires it once on view instead, so a moment
// approved while the child was away is marked seen and stops being flagged
// "Added ✓" on the next visit. Wayfinding only — see RETENTION.md (jarSeenAt).
export function MarkSeenOnView({ when }: { when: boolean }) {
  useEffect(() => {
    if (when) void markJarSeen();
  }, [when]);
  return null;
}
