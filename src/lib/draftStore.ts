// Local-first draft autosave, backed by IndexedDB (client only).
//
// The drawing canvas serialises multi-MB PNG data URLs, so localStorage/
// sessionStorage (~5MB) can't hold a draft — IndexedDB can. Every method is
// wrapped so that if storage is unavailable (private mode, disabled, quota) it
// no-ops instead of throwing, mirroring the sessionStorage try/catch precedent
// in ClassManager.tsx. Nothing here ever leaves the device (Stage 1).

// How long an untouched draft survives before it's purged. There is no cron in
// this app, so expiry is enforced lazily (on load, and via purgeExpired() when
// the editor opens). 30 days lets a child resume next lesson while honouring
// data minimisation (see RETENTION.md).
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// The serialised canvas — the JSON-serialisable DrawingCanvas refs. The
// flattened composite is deliberately NOT stored (multi-MB and fully derivable);
// it's recomputed on restore. `objects` is opaque here (the canvas owns the Obj
// type and casts it back on hydrate).
export type DraftCanvasV1 = {
  v: 1;
  pages: string[]; // pagesRef — transparent stroke PNGs, one per page
  templates: (string | null)[]; // templatesRef — data URLs or /uploads paths
  objects: unknown[][]; // objectsRef — cast to Obj[][] by the canvas
  current: number; // currentRef
  anyDrawn: boolean; // anyDrawnRef
  nextObjId: number; // objIdRef.current — avoid id collisions after resume
};

export type DraftSurface = "template-new" | "activity-response";

export type DraftRecordV1 = {
  key: string; // draftKey — bakes the owner in (see the wrappers)
  ownerId: string; // teacherId | studentId — re-checked on load (shared-device guard)
  surface: DraftSurface;
  updatedAt: number; // epoch ms
  canvas: DraftCanvasV1 | null;
  fields: Record<string, string>; // wrapper's uncontrolled inputs (title/tags/caption…)
};

const DB_NAME = "storyjar-drafts";
const STORE = "drafts";
const DB_VERSION = 1;

export function draftsSupported(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!draftsSupported()) return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

// Run a write within one transaction; resolves when it commits (or on any error).
async function write(body: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = db.transaction(STORE, "readwrite");
      body(t.objectStore(STORE));
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function getRecord(key: string): Promise<DraftRecordV1 | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as DraftRecordV1) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Load a draft, but only if it belongs to this owner and hasn't expired. A
// mismatched ownerId (a different user on a shared classroom device) returns
// null — the primary shared-device guard.
export async function loadDraft(key: string, ownerId: string): Promise<DraftRecordV1 | null> {
  const rec = await getRecord(key);
  if (!rec || rec.ownerId !== ownerId) return null;
  if (Date.now() - rec.updatedAt > RETENTION_MS) {
    await deleteDraft(key);
    return null;
  }
  return rec;
}

// Merge a partial (canvas and/or fields) into the record and stamp updatedAt.
export async function patchDraft(
  key: string,
  ownerId: string,
  surface: DraftSurface,
  patch: Partial<Pick<DraftRecordV1, "canvas" | "fields">>,
): Promise<void> {
  const existing = await getRecord(key);
  const rec: DraftRecordV1 = {
    key,
    ownerId,
    surface,
    updatedAt: Date.now(),
    canvas: patch.canvas !== undefined ? patch.canvas : (existing?.canvas ?? null),
    fields: patch.fields !== undefined ? patch.fields : (existing?.fields ?? {}),
  };
  await write((s) => s.put(rec));
}

export async function deleteDraft(key: string): Promise<void> {
  await write((s) => s.delete(key));
}

// Belt-and-braces for shared devices: clear everything on logout.
export async function clearAllDrafts(): Promise<void> {
  await write((s) => s.clear());
}

// --- Clear-on-success handoff ---------------------------------------------
// Submitting/publishing redirects to a new page, so the editor unmounts before
// it can confirm success. We stash the finished draft's key in sessionStorage
// (survives the redirect within the tab) and a tiny component on the
// destination page deletes it. This only fires on real success, because the
// redirect only happens on success (a failed action re-renders in place).
const CLEAR_FLAG = "sj-draft-clear";

// Mark the finished draft for clearing on the destination page. Carries the
// local key AND the server (surface, contextKey) so the same handoff clears both
// the local IndexedDB copy and the cross-device server copy on success.
export function markDraftForClear(key: string, surface?: string, contextKey?: string): void {
  try {
    sessionStorage.setItem(CLEAR_FLAG, JSON.stringify({ key, surface, contextKey }));
  } catch {
    /* storage unavailable — the 30-day purge is the backstop */
  }
}

// Deletes the marked LOCAL draft and returns the server (surface, contextKey) so
// the caller can discard the server copy too. Returns null if nothing marked.
export async function clearMarkedDraft(): Promise<{ surface?: string; contextKey?: string } | null> {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(CLEAR_FLAG);
    if (raw) sessionStorage.removeItem(CLEAR_FLAG);
  } catch {
    return null;
  }
  if (!raw) return null;
  let info: { key?: string; surface?: string; contextKey?: string };
  try {
    info = JSON.parse(raw) as typeof info;
  } catch {
    info = { key: raw }; // tolerate a legacy plain-string flag
  }
  if (info.key) await deleteDraft(info.key);
  return { surface: info.surface, contextKey: info.contextKey };
}

// Lazy retention (no cron): drop any draft older than maxAgeMs. Called
// opportunistically when the editor mounts.
export async function purgeExpired(maxAgeMs: number): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  await write((s) => {
    const req = s.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      const v = cur.value as DraftRecordV1 | undefined;
      if (!v || typeof v.updatedAt !== "number" || v.updatedAt < cutoff) cur.delete();
      cur.continue();
    };
  });
}
