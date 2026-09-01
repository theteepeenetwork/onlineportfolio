import path from "node:path";

// Where uploaded children's photos and drawings physically live. This is a
// PRIVATE directory OUTSIDE `public/`, so files are never served statically —
// every request goes through the authorising route at /uploads/[...] which
// checks the requester may see that child's work (SAFEGUARDING.md rule 7).
//
// Production sets MEDIA_DIR to a path on the persistent volume (e.g. /data/media).
export const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), ".media");

// Public URL prefix under which media is addressed. The path stays the same as
// before (/uploads/<file>) so every <img src> keeps working; it is now served
// by the authorising route rather than as a static file.
export const UPLOADS_PREFIX = "/uploads/";

// ---------------------------------------------------------------------------
// StoryJar's OWN library media (the shared activity library)
// ---------------------------------------------------------------------------
// A physically separate directory, and that separation is the security control
// rather than a tidiness preference.
//
// Shared library media is the first content in this product that is deliberately
// readable by every signed-in teacher. If it lived in MEDIA_DIR alongside
// children's photographs, "is this file shared?" would be a question about a
// path string, and a teacher who could influence a filename could aim that
// question at somebody else's file. With two directories the route resolves a
// shared path only inside SHARED_MEDIA_DIR and an ordinary path only inside
// MEDIA_DIR, so a teacher upload cannot be served as library content: nothing a
// teacher can reach writes here. Only the publish script does.
//
// It holds no child data and no personal data of any kind. It is StoryJar's own
// teaching illustration, shipped with the repository.
export const SHARED_MEDIA_DIR =
  process.env.SHARED_MEDIA_DIR || path.join(process.cwd(), ".media-shared");

// Public URL prefix. The extra segment is what makes the two kinds of media
// distinguishable in a src attribute, a log line and a test.
export const SHARED_UPLOADS_PREFIX = "/uploads/shared/";

export function isSharedMediaPath(urlPath: string): boolean {
  return urlPath.startsWith(SHARED_UPLOADS_PREFIX);
}

// Every /uploads/shared/<file> path mentioned anywhere in a shared activity's
// payload columns.
//
// Deliberately a scan rather than a parse of the three payload shapes. Copying
// an activity has to find every file it references, and a parser that knows the
// shapes is a parser that silently misses a file the day a shape gains a field.
// A path is a unique token, so matching the token is both simpler and harder to
// get wrong.
const SHARED_PATH_TOKEN = /\/uploads\/shared\/[A-Za-z0-9._-]+/g;

export function sharedMediaPathsIn(...payloads: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const payload of payloads) {
    if (!payload) continue;
    for (const match of payload.matchAll(SHARED_PATH_TOKEN)) found.add(match[0]);
  }
  return [...found];
}

// Every ordinary /uploads/<file> path mentioned anywhere in a template's
// payload columns — the mirror of sharedMediaPathsIn, used when a template goes
// the other way and becomes a library activity.
//
// The negative lookahead is what makes the two functions disjoint. Without it
// this pattern would also match `/uploads/shared/x.svg` (as `/uploads/shared`,
// stopping at the slash), and a republish of an activity that had already been
// through here would start copying files out of the shared directory and back
// into it under new names, growing an orphan a run.
const OWN_PATH_TOKEN = /\/uploads\/(?!shared\/)[A-Za-z0-9._-]+/g;

export function ownMediaPathsIn(...payloads: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const payload of payloads) {
    if (!payload) continue;
    for (const match of payload.matchAll(OWN_PATH_TOKEN)) found.add(match[0]);
  }
  return [...found];
}
