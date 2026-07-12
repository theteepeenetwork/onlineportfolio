"use server";

import { loadDraftServer, discardDraftServer, type DraftLoad } from "@/lib/drafts";

// Owner-scoped reads/erasure of a cross-device draft. Saving goes through the
// route handler (POST /api/drafts) instead, because a Server Action can't be
// called from sendBeacon and its body is capped — a draft's composite pages are
// multi-MB. These two carry no large body, so they stay as actions.

export async function loadDraft(surface: string, contextKey: string): Promise<DraftLoad | null> {
  return loadDraftServer(surface, contextKey);
}

export async function discardDraft(surface: string, contextKey: string): Promise<void> {
  await discardDraftServer(surface, contextKey);
}
