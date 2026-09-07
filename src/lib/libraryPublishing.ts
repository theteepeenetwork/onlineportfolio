import "server-only";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import {
  MEDIA_DIR,
  SHARED_MEDIA_DIR,
  SHARED_UPLOADS_PREFIX,
  UPLOADS_PREFIX,
  ownMediaPathsIn,
} from "@/lib/mediaPath";
import { canPublish, publishRefusal, type LibraryPayload } from "@/lib/libraryPermission";

// The two gates live in @/lib/libraryPermission, which carries no `server-only`
// so a blocking spec can call them with real fixture ids. That is not tidiness:
// a mutation test proved that when they lived here, disabling all three of them
// left every runtime test green, because a spec cannot craft a Server Action
// request. Read the header of that file before moving them back.
export { canPublish, publishRefusal, type LibraryPayload };

// Putting one of StoryJar's own activities into the shared library.
//
// THE ONE FILE UNDER src/ THAT MAY WRITE SharedActivity
//
// Until this existed, "no teacher-authenticated code path may write to the
// shared table" was enforced by there being no such code at all, and asserted
// by a grep over src/ in
// tests/battery/security/shared-activities.spec.ts. That guarantee has changed
// shape rather than gone, and it is worth being exact about how, because a
// reader who assumes the old one still holds will make a bad decision:
//
//   BEFORE: nothing in the application can write this table. Publishing is a
//           script somebody runs against the repository, reviewable in a pull
//           request.
//   NOW:    one named module can, and only on behalf of a school whose
//           `canPublishToLibrary` is true — a column no screen writes, settable
//           only by scripts/ops/seed-academy.mjs or a migration, and true for
//           StoryJar Academy alone.
//
// What holds it up is three things together: the flag is unreachable from any
// user interface, every write in the application goes through `canPublish()`
// below, and the same spec now proves at RUNTIME that a teacher at an ordinary
// school forging the submission publishes nothing. The old assertion could only
// ever prove an absence.
//
// THE REPOSITORY MANIFEST STILL WORKS AND IS STILL THE WAY TO SEED
//
// `content/shared-activities/index.json` and
// `scripts/ops/publish-shared-activities.mjs` are unchanged and remain how a
// fresh environment is filled and how art ships with the repository. They upsert
// on the same `slug` this module does, so the two roads do not fight; the
// database is the truth and the manifest is the baseline.

/**
 * A slug from a title: lowercase, words joined by hyphens, nothing else.
 *
 * Kept deliberately dull because it is an identity that outlives the title it
 * came from. Renaming a published activity does not re-slug it — the slug is
 * what teachers' copies were made against and what the manifest upserts on.
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "activity";
}

/**
 * A slug nothing else in the library is using.
 *
 * Collisions are resolved by suffixing rather than by failing, because the
 * person publishing is mid-job and "that name is taken" is a worse answer than
 * `autumn-walk-2` when the two really are different activities.
 */
export async function freeSlug(title: string): Promise<string> {
  const base = slugify(title);
  for (let n = 1; n < 200; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    // BOTH unique namespaces, not just the obvious one. `slug` is unique on
    // SharedActivity and `librarySlug` is unique on ActivityTemplate, so a
    // library row deleted out of band while a template still holds its slug
    // would leave the name looking free here and then fail with P2002 on the
    // template update. Unreachable today — there is no in-app delete — which is
    // exactly the kind of thing that stops being unreachable quietly.
    const [taken, claimed] = await Promise.all([
      db.sharedActivity.findUnique({ where: { slug: candidate }, select: { id: true } }),
      db.activityTemplate.findUnique({ where: { librarySlug: candidate }, select: { id: true } }),
    ]);
    if (!taken && !claimed) return candidate;
  }
  throw new Error(`could not find a free slug for "${title}"`);
}

/**
 * Copy every file this template references into the shared media directory, and
 * return the payload columns rewritten to point at the copies.
 *
 * The exact mirror of `copySharedMediaForTeacher` in src/lib/sharedActivities.ts,
 * and it copies BYTES for the same reason, running the other way. If it copied
 * path strings, the library activity would depend on a file in the Academy
 * teacher's own media directory: archiving that template, or any future fix to
 * FINDINGS F27 that finally gives template media an erasure path, would blank
 * the published activity and every classroom that had added it.
 *
 * Destination names are deterministic, `<slug>-<source filename>`, which is the
 * rule scripts/ops/publish-shared-activities.mjs already follows and for the
 * same reason: a random name per publish would leave the previous run's file
 * behind every time somebody fixed a typo, and the shared directory would grow
 * an orphan a publish.
 */
export async function copyTemplateMediaForLibrary(
  slug: string,
  payload: LibraryPayload,
): Promise<LibraryPayload> {
  const paths = ownMediaPathsIn(payload.templatePathsJson, payload.quizJson, payload.objectsJson);
  if (paths.length === 0) return payload;

  await mkdir(SHARED_MEDIA_DIR, { recursive: true });

  const rewrites = new Map<string, string>();
  for (const from of paths) {
    const name = from.slice(UPLOADS_PREFIX.length);
    const copyName = `${slug}-${name}`;
    await copyFile(path.join(MEDIA_DIR, name), path.join(SHARED_MEDIA_DIR, copyName));
    rewrites.set(from, `${SHARED_UPLOADS_PREFIX}${copyName}`);
  }

  // Token substitution rather than a parse of the three payload shapes, for the
  // reason given on sharedMediaPathsIn: a parser that knows the shapes is a
  // parser that misses a file the day a shape gains a field, and a missed file
  // is a broken background in somebody else's classroom.
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

export type PublishInput = {
  teacherId: string;
  templateId: string;
  ageMode: string | null;
  sortOrder: number;
};

export type PublishOutcome =
  | { ok: true; slug: string }
  | { ok: false; problem: string };

/**
 * Promote one of this teacher's templates into the library, or update the
 * activity it was already published as.
 *
 * It never makes anything visible. The row is created with `published: false`
 * and only `setPublished` below flips it, so a half-finished activity cannot
 * reach a classroom by one misclick — and the row's own default in the schema
 * is already false, so this costs nothing to keep true.
 */
export async function publishTemplate(input: PublishInput): Promise<PublishOutcome> {
  if (!(await canPublish(input.teacherId))) {
    return { ok: false, problem: "This school cannot publish to the StoryJar library." };
  }

  const template = await db.activityTemplate.findFirst({
    where: { id: input.templateId, teacherId: input.teacherId },
    select: {
      id: true,
      title: true,
      instructions: true,
      templatePathsJson: true,
      quizJson: true,
      objectsJson: true,
      tagsJson: true,
      librarySlug: true,
    },
  });
  if (!template) return { ok: false, problem: "That activity could not be found." };

  // BEFORE ANY FILE MOVES. A refusal has to happen while nothing has been
  // copied, because the copy is the disclosure: once bytes are in
  // SHARED_MEDIA_DIR they are one published row away from every teacher.
  const borrowed = await publishRefusal(input.teacherId, {
    templatePathsJson: template.templatePathsJson,
    quizJson: template.quizJson,
    objectsJson: template.objectsJson,
  });
  if (borrowed) return { ok: false, problem: borrowed };

  const slug = template.librarySlug ?? (await freeSlug(template.title));

  // Files first. If copying fails there is no half-made row pointing at bytes
  // that are not there — the same order, for the same reason, as
  // addSharedActivityToLibrary going the other way.
  const payload = await copyTemplateMediaForLibrary(slug, {
    templatePathsJson: template.templatePathsJson,
    quizJson: template.quizJson,
    objectsJson: template.objectsJson,
  });

  // What the template owns: its words and its pages. Re-publishing overwrites
  // these, because that is what "Update in library" means.
  const fromTemplate = {
    title: template.title,
    instructions: template.instructions,
    templatePathsJson: payload.templatePathsJson,
    quizJson: payload.quizJson,
    objectsJson: payload.objectsJson,
    tagsJson: template.tagsJson,
  };

  // What the LIBRARY owns: the band it is offered under and where it sits on
  // the shelf. Set once when the activity first arrives and edited from the
  // Publishing screen afterwards — deliberately NOT in the update half of the
  // upsert, because re-publishing a corrected worksheet must not silently
  // reset an editorial decision made weeks later by somebody else.
  const editorial = { ageMode: input.ageMode, sortOrder: input.sortOrder };

  await db.sharedActivity.upsert({
    where: { slug },
    create: { slug, origin: "STORYJAR", published: false, ...fromTemplate, ...editorial },
    update: fromTemplate,
  });

  // Only after the library row exists, so a failure above cannot leave a
  // template claiming a slug that was never published.
  if (template.librarySlug !== slug) {
    await db.activityTemplate.update({ where: { id: template.id }, data: { librarySlug: slug } });
  }

  return { ok: true, slug };
}

/**
 * The two things about a library activity that are decided AFTER it is written
 * rather than while it is being written: which age band it is offered under,
 * and where it sits in the order teachers see.
 *
 * Neither comes from the template, because neither is a property of the
 * activity — they are editorial choices about the library as a whole, and the
 * person making them is looking at the shelf rather than at the canvas.
 */
export async function updateLibraryActivity(
  teacherId: string,
  slug: string,
  ageMode: string | null,
  sortOrder: number,
): Promise<PublishOutcome> {
  if (!(await canPublish(teacherId))) {
    return { ok: false, problem: "This school cannot publish to the StoryJar library." };
  }
  const row = await db.sharedActivity.findUnique({ where: { slug }, select: { id: true } });
  if (!row) return { ok: false, problem: "That library activity could not be found." };

  await db.sharedActivity.update({ where: { slug }, data: { ageMode, sortOrder } });
  return { ok: true, slug };
}

/**
 * Make a published activity visible to teachers, or withdraw it.
 *
 * Withdrawing sets the flag and leaves the row and its files alone. Teachers'
 * copies are full copies and are unaffected either way; what changes is that
 * the activity leaves the browse screen, and its media stops being served,
 * because the /uploads route answers a shared path only when a PUBLISHED row
 * references it.
 */
export async function setPublished(
  teacherId: string,
  slug: string,
  published: boolean,
): Promise<PublishOutcome> {
  if (!(await canPublish(teacherId))) {
    return { ok: false, problem: "This school cannot publish to the StoryJar library." };
  }

  // Any activity in the library, not only the ones this person published. It is
  // StoryJar's library, not one member of staff's: sixteen Academy accounts
  // share the job, and an activity that could only be withdrawn by whoever
  // happened to publish it is an activity that cannot be withdrawn on a Friday.
  // It also has to reach the rows the repository manifest created, which have no
  // template behind them at all.
  //
  // The slug is therefore only a name, never an authority. What decides is
  // canPublish() above, and it is a question about the school.
  const row = await db.sharedActivity.findUnique({ where: { slug }, select: { id: true } });
  if (!row) return { ok: false, problem: "That library activity could not be found." };

  await db.sharedActivity.update({ where: { slug }, data: { published } });
  return { ok: true, slug };
}
