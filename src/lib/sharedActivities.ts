import "server-only";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MEDIA_DIR, SHARED_MEDIA_DIR, SHARED_UPLOADS_PREFIX, sharedMediaPathsIn } from "@/lib/mediaPath";

// Turning one of Storyjar's library activities into a template the teacher owns.
//
// THE COPY IS A REAL COPY, FILES INCLUDED, AND THAT IS THE WHOLE POINT.
//
// `duplicateTemplate` copies the path STRINGS of a template's images, so an
// original and its duplicate point at the same bytes on disk. That is logged as
// FINDINGS F27 and is a latent bug there. Doing the same thing here would make
// it structural: every teacher's copy would depend on a file Storyjar owns, and
// replacing or removing a library background would silently blank that activity
// in every classroom that had added it, discovered by a teacher mid-lesson.
//
// So adding copies the bytes into the teacher's own media directory under fresh
// names, and rewrites the payload columns to point at them. After that the
// teacher's template shares nothing with the original, and Storyjar can delete,
// replace or rewrite the shared activity with no effect on anybody's classroom.
//
// This does NOT fix F27. `duplicateTemplate` still copies strings, template
// media still has no erasure path, and that finding stays open.

export type SharedPayload = {
  templatePathsJson: string | null;
  quizJson: string | null;
  objectsJson: string | null;
};

// Copy every file a shared activity references into MEDIA_DIR, and return the
// payload columns rewritten to the new paths.
//
// The rewrite is a token substitution rather than a parse of the three payload
// shapes, for the reason given on sharedMediaPathsIn: a parser that knows the
// shapes is a parser that misses a file the day a shape gains a field, and a
// missed file is a broken image in a classroom.
export async function copySharedMediaForTeacher(payload: SharedPayload): Promise<SharedPayload> {
  const paths = sharedMediaPathsIn(payload.templatePathsJson, payload.quizJson, payload.objectsJson);
  if (paths.length === 0) return payload;

  await mkdir(MEDIA_DIR, { recursive: true });

  const rewrites = new Map<string, string>();
  for (const from of paths) {
    const name = from.slice(SHARED_UPLOADS_PREFIX.length);
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    const copyName = `shared-${randomUUID()}${ext}`;
    await copyFile(path.join(SHARED_MEDIA_DIR, name), path.join(MEDIA_DIR, copyName));
    rewrites.set(from, `/uploads/${copyName}`);
  }

  const rewrite = (json: string | null) => {
    if (!json) return json;
    let out = json;
    for (const [from, to] of rewrites) out = out.split(from).join(to);
    return out;
  };

  return {
    templatePathsJson: rewrite(payload.templatePathsJson),
    quizJson: rewrite(payload.quizJson),
    objectsJson: rewrite(payload.objectsJson),
  };
}
