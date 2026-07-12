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

echo "[start] preparing persistent storage under /data"
mkdir -p "${MEDIA_DIR:-/data/media}"

echo "[start] applying database schema"
npx prisma db push --skip-generate --accept-data-loss

echo "[start] seeding demo data (idempotent — skips if already populated)"
npx tsx prisma/seed.ts || echo "[start] seed step skipped/failed — continuing to serve"

echo "[start] launching Next.js"
exec npx next start
