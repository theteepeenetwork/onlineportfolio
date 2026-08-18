#!/usr/bin/env bash
set -euo pipefail

# Railway release/start for Storyjar.
#
# A persistent volume is mounted at /data. We keep the SQLite database and the
# uploaded photos/drawings there so they survive deploys and restarts:
#   - media: uploaded children's photos/drawings live in MEDIA_DIR (/data/media),
#     a PRIVATE directory. They are NOT public files — the app serves them only
#     through the authorising /uploads route (SAFEGUARDING.md rule 7).
#   - database: DATABASE_URL points at file:/data/prod.db (set in the Railway env).
#
# THREE THINGS THIS SCRIPT DELIBERATELY DOES NOT DO, each of which it used to:
#
#  1. It does not run `prisma db push --accept-data-loss`. That resolved a schema
#     edit into whatever statements it took to reach the new shape, including
#     dropping a column full of children's work, unattended, on the same deploy
#     that passed CI against a throwaway database. Schema changes now arrive as
#     reviewed SQL in prisma/migrations, applied by `prisma migrate deploy`.
#  2. It does not seed. `prisma/seed.ts` writes demo teachers and demo drawings,
#     and it skipped only when a teacher row already existed. A fresh volume or a
#     half-finished restore is exactly the moment that test is wrong, so the seed
#     would mix fixture data into real storage at the worst possible time. The
#     seed now also refuses to run when NODE_ENV=production, so the guard travels
#     with the file rather than depending on this caller.
#  3. It does not swallow a failure with `|| echo "... continuing to serve"`. A
#     schema step that fails must stop the boot. The healthcheck in railway.json
#     then holds the previous deployment in place, which is the whole point of
#     having one: a container that cannot migrate must not take traffic.

echo "[start] preparing persistent storage under /data"
mkdir -p "${MEDIA_DIR:-/data/media}"
# Storyjar's OWN library media, kept separate from every teacher upload (see
# src/lib/mediaPath.ts for why that separation is the access control rather than
# tidiness). It needs the volume for the same reason MEDIA_DIR does.
#
# SHARED_MEDIA_DIR must be set in the Railway environment to /data/media-shared.
# If it is unset the application falls back to a directory inside the container
# while this line creates one on the volume, and the two would never meet.
mkdir -p "${SHARED_MEDIA_DIR:-/data/media-shared}"

MIGRATE_LOG="$(mktemp)"

fail_boot() {
  echo "[start] MIGRATION FAILED. Not serving. The previous deployment keeps traffic."
  echo "[start] Read the Prisma error above. Do NOT reach for 'prisma db push' to get"
  echo "[start] past it: that is the command this script was written to remove."
  exit 1
}

echo "[start] applying database migrations"
if ! npx prisma migrate deploy 2>&1 | tee "$MIGRATE_LOG"; then
  # `tee` masks the exit status, so ask the log what happened rather than $?.
  :
fi

if grep -q "P3005" "$MIGRATE_LOG"; then
  # The one recoverable failure, and it happens exactly once in this repo's life.
  #
  # P3005 means the database has tables but no migration history, which is what
  # every database created by the old `prisma db push` looks like. It has to be
  # baselined: told that 0_init is already applied, so `migrate deploy` stops
  # trying to create tables that exist.
  #
  # This is done here rather than by hand, and the reason is worth writing down.
  # The obvious instruction, "run `prisma migrate resolve` once from the Railway
  # shell", is close to unexecutable: a shell attaches to the RUNNING deployment,
  # which on the first deploy of this script is still the previous container, and
  # that container has no prisma/migrations directory to resolve against. The new
  # container exits before it can be attached to. So the baseline runs where the
  # migration files actually are.
  #
  # What makes it safe is the drift check below, not the fact that it is
  # automated. `migrate diff --exit-code` returns 0 only when the live schema is
  # byte-for-byte what 0_init describes. If anything differs, marking 0_init
  # applied would bury a real difference, so the boot fails instead and a human
  # looks. Rehearsed against a copy of the production database before shipping.
  echo "[start] no migration history found (P3005). Checking the live schema"
  echo "[start] against 0_init before baselining."

  if npx prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel prisma/schema.prisma \
    --exit-code; then
    echo "[start] live schema matches 0_init exactly. Baselining, once."
    npx prisma migrate resolve --applied 0_init || fail_boot
    npx prisma migrate deploy || fail_boot
  else
    echo "[start] REFUSING TO BASELINE. The live schema is not what 0_init"
    echo "[start] describes, so marking it applied would hide a real difference."
    echo "[start] Someone needs to look at the diff above before this can deploy."
    fail_boot
  fi
elif ! grep -q "No pending migrations to apply\|migration(s) applied\|Applying migration" "$MIGRATE_LOG"; then
  fail_boot
fi

echo "[start] launching Next.js"
exec npx next start
