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
