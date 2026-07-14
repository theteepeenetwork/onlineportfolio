// The fixed sticker catalog — the only stickers that exist. The database
// stores sticker KEYS only (JournalItem.stickersJson); everything about how a
// sticker looks (label, colour, holographic foil) is derived from this file.
// Keeping the vocabulary fixed and tiny is deliberate: teacher→child feedback
// stays warm but constrained, and no new free-form personal data is introduced
// (SAFEGUARDING.md rule 2). Shared by server actions and UI components.

export type StickerDef = {
  k: string; // stable key stored in the DB
  label: string; // short label shown under the sticker
  bg: string; // accent colour of the die-cut disc
  holo?: boolean; // holographic rainbow foil instead of a flat accent
};

export const STICKER_CATEGORIES = [
  { key: "praise", name: "Praise" },
  { key: "skills", name: "Skills" },
  { key: "feelings", name: "Feelings" },
  { key: "milestones", name: "Milestones" },
] as const;

export type StickerCategoryKey = (typeof STICKER_CATEGORIES)[number]["key"];

export const STICKER_CATALOG: Record<StickerCategoryKey, StickerDef[]> = {
  praise: [
    { k: "star", label: "Star work", bg: "#F0B441" },
    { k: "brill", label: "Brilliant", bg: "#8AB9D6", holo: true },
    { k: "effort", label: "Great effort", bg: "#E08A9B" },
    { k: "love", label: "Love this", bg: "#C2476B" },
    { k: "trophy", label: "Top marks", bg: "#F0B441" },
    { k: "crown", label: "Superstar", bg: "#E08A9B", holo: true },
  ],
  skills: [
    { k: "sci", label: "Science", bg: "#A6C979" },
    { k: "write", label: "Writing", bg: "#8AB9D6" },
    { k: "maths", label: "Maths", bg: "#4E9C94" },
    { k: "kind", label: "Kindness", bg: "#C2476B" },
    { k: "read", label: "Reading", bg: "#F0B441" },
    { k: "art", label: "Art", bg: "#E08A9B" },
  ],
  feelings: [
    { k: "smile", label: "Made me smile", bg: "#F0B441" },
    { k: "wow", label: "Wow!", bg: "#E08A9B", holo: true },
    { k: "proud", label: "So proud", bg: "#C2476B", holo: true },
    { k: "laugh", label: "Made me laugh", bg: "#F0B441" },
    { k: "curious", label: "So curious", bg: "#8AB9D6" },
    { k: "brave", label: "So brave", bg: "#4E9C94" },
  ],
  milestones: [
    { k: "first", label: "First try", bg: "#4E9C94" },
    { k: "finish", label: "You finished", bg: "#8AB9D6" },
    { k: "best", label: "Personal best", bg: "#A6C979", holo: true },
    { k: "target", label: "Bullseye", bg: "#C2476B", holo: true },
    { k: "mountain", label: "New heights", bg: "#8AB9D6" },
    { k: "levelup", label: "Levelled up", bg: "#F0B441" },
  ],
};

// Flat lookup by key.
export const STICKER_BY_KEY: ReadonlyMap<string, StickerDef> = new Map(
  Object.values(STICKER_CATALOG)
    .flat()
    .map((s) => [s.k, s]),
);

// A teacher may place at most this many stickers on one moment.
export const MAX_STICKERS = 4;

// Reduce untrusted input (form fields / stored JSON) to a clean list of known
// sticker keys: strings only, catalogue members only, de-duplicated, capped.
// Never trust the client's idea of what a sticker is (SAFEGUARDING rules 4, 8).
export function sanitizeStickerKeys(raw: unknown[]): string[] {
  const clean: string[] = [];
  for (const v of raw) {
    const k = String(v);
    if (STICKER_BY_KEY.has(k) && !clean.includes(k)) clean.push(k);
    if (clean.length >= MAX_STICKERS) break;
  }
  return clean;
}

// Read the stored stickersJson column back into sticker definitions.
export function readStickers(json: string | null | undefined): StickerDef[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return sanitizeStickerKeys(parsed)
      .map((k) => STICKER_BY_KEY.get(k))
      .filter((s): s is StickerDef => Boolean(s));
  } catch {
    return [];
  }
}
