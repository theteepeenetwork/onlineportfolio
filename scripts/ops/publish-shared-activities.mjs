#!/usr/bin/env node
// Publishing StoryJar's own activity library.
//
// WHY THIS IS A SCRIPT AND NOT A SCREEN
//
// The owner's first constraint is that the library is curated, not community:
// only StoryJar publishes, and no teacher may publish, share or submit an
// activity by accident. This script is the version-controlled road in: the
// library is reviewable in a pull request and cannot be fat-fingered in
// production at eleven at night.
//
// THIS IS NO LONGER THE ONLY ROAD, as of 1 September 2026. StoryJar staff can
// now publish from inside the application, signed in at StoryJar Academy — see
// docs/library-publishing.md. Both roads upsert on `slug`, so they do not
// fight, but be clear about the consequence: THE DATABASE IS THE TRUTH AND THIS
// MANIFEST IS THE BASELINE. It is how a fresh environment is filled and how art
// ships with the repository. It is not a mirror of production, and reading it
// as one will mislead you.
//
// It is still not an OPERATOR screen, and that is deliberate rather than
// pending. Authoring needs the canvas, template payload reads and filesystem
// writes, all of which the ops blindness gate refuses under its roots; the
// publish step lives with the person who built the activity, on the school
// surface, and the operator console holds a read-only view at /ops/library.
//
// scripts/ops/ is deliberately outside the ops blindness gate's roots: these
// scripts run on the server with full database access by design and are
// procedurally constrained rather than structurally blind. That is stated in
// the gate's own header, and it is why the guarantee that no TEACHER-reachable
// path writes to this table is asserted separately, over src/, in
// tests/battery/security/shared-activities.spec.ts.
//
// IDEMPOTENCE
//
// Everything keys on `slug`. Running this twice creates one row, not two, and
// correcting an activity updates it in place. Updating in place is what keeps
// the copies teachers have already made safe: their copy is a full copy, files
// included, so it neither changes nor breaks when the original does.
//
// Usage:  node scripts/ops/publish-shared-activities.mjs
//         node scripts/ops/publish-shared-activities.mjs --dry-run
import { PrismaClient } from "@prisma/client";
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content", "shared-activities");
const MEDIA_SRC = path.join(CONTENT, "media");
const SHARED_MEDIA_DIR = process.env.SHARED_MEDIA_DIR || path.join(ROOT, ".media-shared");
const dryRun = process.argv.includes("--dry-run");

const db = new PrismaClient();

// A deterministic destination name, derived from the slug and the source
// filename. Deterministic on purpose: a random name per run would leave the
// previous run's file behind on every publish, and the shared directory would
// grow a new orphan every time somebody fixed a typo.
const destName = (slug, file) => `${slug}-${file}`;

function publishMedia(slug, files) {
  if (!files?.length) return [];
  if (!dryRun) mkdirSync(SHARED_MEDIA_DIR, { recursive: true });
  const paths = [];
  for (const file of files) {
    const from = path.join(MEDIA_SRC, file);
    if (!existsSync(from)) throw new Error(`${slug}: media file "${file}" is not in ${MEDIA_SRC}`);
    const name = destName(slug, file);
    if (!dryRun) copyFileSync(from, path.join(SHARED_MEDIA_DIR, name));
    paths.push(`/uploads/shared/${name}`);
  }
  return paths;
}

async function main() {
  const manifestPath = path.join(CONTENT, "index.json");
  if (!existsSync(manifestPath)) {
    console.error(`✖ No manifest at ${manifestPath}. The library is defined in the repository.`);
    process.exit(1);
  }
  const { activities } = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(activities)) {
    console.error("✖ The manifest must hold an `activities` array.");
    process.exit(1);
  }

  const seen = new Set();
  for (const a of activities) {
    if (!a.slug) throw new Error(`every activity needs a slug: ${JSON.stringify(a).slice(0, 80)}`);
    if (seen.has(a.slug)) throw new Error(`duplicate slug "${a.slug}" in the manifest`);
    seen.add(a.slug);

    const backgrounds = publishMedia(a.slug, a.backgrounds);
    const data = {
      title: a.title,
      instructions: a.instructions ?? null,
      templatePathsJson: backgrounds.length ? JSON.stringify(backgrounds) : null,
      quizJson: a.quizJson ? JSON.stringify(a.quizJson) : null,
      objectsJson: a.objectsJson ? JSON.stringify(a.objectsJson) : null,
      tagsJson: a.tags?.length ? JSON.stringify(a.tags) : null,
      ageMode: a.ageMode ?? null,
      published: a.published !== false,
      sortOrder: a.sortOrder ?? 0,
    };

    if (dryRun) {
      console.log(`  would publish ${a.slug} (${data.published ? "published" : "unpublished"})`);
      continue;
    }
    // Upsert on the slug: this is the whole of the idempotence guarantee, and
    // the reason a second run is a no-op rather than a duplicate.
    const before = await db.sharedActivity.findUnique({ where: { slug: a.slug }, select: { id: true } });
    await db.sharedActivity.upsert({ where: { slug: a.slug }, create: { slug: a.slug, ...data }, update: data });
    console.log(`  ${before ? "updated" : "created"} ${a.slug}`);
  }

  const total = dryRun ? activities.length : await db.sharedActivity.count();
  console.log(`\n✓ Shared library: ${activities.length} activity/activities in the manifest, ${total} row(s) in the table.`);
  console.log("  Teachers' existing copies are untouched: adding copies the row AND the files.");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(`✖ Publish failed: ${e.message}`);
  await db.$disconnect();
  process.exit(1);
});
