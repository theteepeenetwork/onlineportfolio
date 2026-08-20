// Every image a journal item carries.
//
// A drawing can run to several pages. When it does, `mediaPathsJson` holds them
// all and supersedes `mediaPath`, which is only ever the cover. Anything
// reading one without the other shows page one and quietly loses the rest —
// which is exactly what the approval queue did.
//
// Shared rather than copied, because the parse has to be forgiving in the same
// way everywhere: a malformed list falls back to the cover instead of throwing
// and taking the page with it.
export function mediaPaths(item: {
  mediaPath: string | null;
  mediaPathsJson: string | null;
}): string[] {
  if (item.mediaPathsJson) {
    try {
      const paths = JSON.parse(item.mediaPathsJson) as string[];
      if (Array.isArray(paths) && paths.length) return paths.filter((p) => typeof p === "string");
    } catch {
      // fall through to the single path
    }
  }
  return item.mediaPath ? [item.mediaPath] : [];
}

// The pages to SHOW a person, which are not always the pages of record.
//
// `mediaPaths()` above is the work itself — what the child drew, and what gets
// published. It deliberately carries no question boxes: those are never
// flattened, so that an approved drawing stays a drawing rather than a
// screenshot of a worksheet. That invariant is right, and it had one very
// visible cost — a child who answered a quiz on an otherwise empty page handed
// in a blank white rectangle, and every teacher who opened it in the queue saw
// nothing and reasonably concluded it had not saved.
//
// So when a hand-in carries a picture of itself, looking-surfaces use it: the
// queue, the work viewer, the jar. Anything that needs the work — publishing,
// re-editing, erasure — keeps using `mediaPaths()`.
//
// Falls back to the work whenever there is no picture, which is every item
// saved before this existed and every hand-in without a quiz.
export function workPages(item: {
  mediaPath: string | null;
  mediaPathsJson: string | null;
  // Required, like the gather type in src/lib/erasure.ts: optional here meant a
  // surface that simply forgot the column compiled fine and quietly showed the
  // blank page this function exists to prevent.
  previewPathsJson: string | null;
}): string[] {
  if (item.previewPathsJson) {
    try {
      const paths = JSON.parse(item.previewPathsJson) as string[];
      if (Array.isArray(paths) && paths.length) {
        const clean = paths.filter((p) => typeof p === "string");
        if (clean.length) return clean;
      }
    } catch {
      // a picture we cannot read is a picture we do not use
    }
  }
  return mediaPaths(item);
}

// The one image that stands for a piece of work: its cover, as it LOOKED.
//
// The same choice `workPages()` makes, for the surfaces that show a single
// thumbnail rather than every page — the child's jar, the EYFS home, the
// sticker-arrival card. Those read `mediaPath` straight off the row, which is
// the cover of the work of RECORD, and for a quiz page that is a blank sheet:
// a child who answered three questions saw a white rectangle with their
// teacher's stickers stuck to nothing.
export function workCover(item: {
  mediaPath: string | null;
  mediaPathsJson: string | null;
  previewPathsJson: string | null;
}): string | null {
  return workPages(item)[0] ?? null;
}
