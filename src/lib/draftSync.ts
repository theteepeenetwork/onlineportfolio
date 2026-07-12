// Client-side wrappers around the cross-device draft server surface (Stage 2).
// All are best-effort: any failure (offline, error) no-ops so the local-first
// draft (Stage 1) is never blocked by the network.
import { loadDraft as loadDraftAction, discardDraft as discardDraftAction } from "@/app/actions/drafts";

export type ServerDraft = { pages: string[]; fields: Record<string, string>; updatedAt: number };

// SAVE goes through the route handler, not a Server Action — the body carries
// the full composite pages (multi-MB), which exceeds the Server Action body cap.
export async function serverSaveDraft(
  surface: string,
  contextKey: string,
  pages: string[],
  fields: Record<string, string>,
): Promise<{ ok: boolean; updatedAt?: number }> {
  try {
    const res = await fetch("/api/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surface, contextKey, pages, fields }),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as { ok: boolean; updatedAt?: number };
  } catch {
    return { ok: false };
  }
}

export async function serverLoadDraft(surface: string, contextKey: string): Promise<ServerDraft | null> {
  try {
    return await loadDraftAction(surface, contextKey);
  } catch {
    return null;
  }
}

export async function serverDiscardDraft(surface: string, contextKey: string): Promise<void> {
  try {
    await discardDraftAction(surface, contextKey);
  } catch {
    /* best-effort — the 30-day purge is the backstop */
  }
}
