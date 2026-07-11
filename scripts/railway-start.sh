#!/usr/bin/env bash
set -euo pipefail

# Railway release/start for Storyjar.
#
# A persistent volume is mounted at /data. We keep the SQLite database and the
# uploaded photos/drawings there so they survive deploys and restarts:
#   - uploads: public/uploads is symlinked to /data/uploads, so files written by
#     the app (to public/uploads) land on the volume and Next still serves them
#     at /uploads/<file> with no code change.
#   - database: DATABASE_URL points at file:/data/prod.db (set in the Railway env).

echo "[start] preparing persistent storage under /data"
mkdir -p /data/uploads
rm -rf public/uploads
ln -sfn /data/uploads public/uploads

echo "[start] applying database schema"
npx prisma db push --skip-generate --accept-data-loss

echo "[start] seeding demo data (idempotent — skips if already populated)"
npx tsx prisma/seed.ts || echo "[start] seed step skipped/failed — continuing to serve"

echo "[start] launching Next.js"
exec npx next start
