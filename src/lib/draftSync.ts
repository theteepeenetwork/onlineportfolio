// Client-side wrappers around the cross-device draft server surface (Stage 2).
// All are best-effort: any failure (offline, error) no-ops so the local-first
// draft (Stage 1) is never blocked by the network.
//
// "Any failure" used to mean any *error*. It did not cover a hang, and a hang is
// the more common way a school connection breaks: the request is accepted and
// then nothing comes back, so neither the try/catch below nor the browser's own
// machinery ever fires. See `serverLoadDraftBounded` and finding F34.
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

// How long anything waits for the cross-device copy before carrying on without
// it. Chosen to be comfortably longer than the lookup really takes (one indexed
// row, owner-scoped) and short enough that nobody sits in front of a canvas
// wondering whether their work is gone. A cold server whose first compile of the
// action overruns this is not a problem: the local copy is offered immediately
// and `eventual` still upgrades the offer if the server copy turns out newer.
export const SERVER_LOOKUP_BUDGET_MS = 4000;

// A cross-device lookup, in two views, because the caller needs both.
//
// `settled` never takes longer than the budget: it reports `{ timedOut: true }`
// rather than leaving the caller waiting on a promise that may never resolve.
// That is the whole point. A draft sitting safely in the browser's own storage
// must never be withheld from the person who made it because a network call they
// know nothing about did not come back.
//
// `eventual` is the same lookup with no deadline, for a caller that wants to
// honour a genuinely newer server copy that merely arrived late. Handing back
// one promise and letting the caller race it themselves would work too; handing
// back both makes the late arrival something a reader can see is handled, rather
// than something silently dropped on the floor.
export function serverLoadDraftBounded(
  surface: string,
  contextKey: string,
): {
  settled: Promise<{ timedOut: false; draft: ServerDraft | null } | { timedOut: true }>;
  eventual: Promise<ServerDraft | null>;
} {
  // Never rejects (serverLoadDraft catches), so `eventual` needs no handler of
  // its own to avoid an unhandled rejection if the caller ignores it.
  const eventual = serverLoadDraft(surface, contextKey);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), SERVER_LOOKUP_BUDGET_MS);
  });
  const settled = Promise.race([
    // Cancel the deadline on the ordinary path, so a lookup that answers in
    // milliseconds does not leave a timer pending for the rest of the budget.
    eventual.then((draft) => {
      clearTimeout(timer);
      return { timedOut: false as const, draft };
    }),
    deadline,
  ]);
  return { settled, eventual };
}

export async function serverDiscardDraft(surface: string, contextKey: string): Promise<void> {
  try {
    await discardDraftAction(surface, contextKey);
  } catch {
    /* best-effort — the 30-day purge is the backstop */
  }
}
