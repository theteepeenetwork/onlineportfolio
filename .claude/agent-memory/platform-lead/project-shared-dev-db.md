---
name: project-shared-dev-db
description: prisma/dev.db is shared mutable state in a multi-agent session and has no migration history; verify a migration on a copy, never with migrate dev or --force-reset
metadata:
  type: project
---

**`prisma/dev.db` is shared mutable state when other sessions are live, and it
carries no `_prisma_migrations` table** — local setup is `prisma db push`
(`npm run setup`), so migration history exists for production only.

**Why:** two consequences follow. `prisma migrate dev` and `db push
--force-reset` would reset or re-seed a database three other agents are running
dev servers against, and `migrate deploy` is meaningless locally because there
is no history to be pending against. On 2026-08-25, mid-task, another agent
reseeded `dev.db` between two of my commands: a snapshot with 12 teachers became
one with 4, and a `db push` I expected to create a table reported "already in
sync" because their reseed had applied my schema for me.

**How to apply:** to prove a migration applies to a populated database, `cp
prisma/dev.db` somewhere under the job tmp dir and run the SQL against the
COPY, then `PRAGMA foreign_key_check`. To prove the migration matches the
schema, `npx prisma migrate diff --from-migrations prisma/migrations
--to-schema-datamodel prisma/schema.prisma --shadow-database-url file:<tmp>
--script` and expect "This is an empty migration." Do not treat a row count read
from `dev.db` as stable across steps. See
[[feedback-no-formatters-in-a-shared-tree]].

**The battery does not need `prisma/dev.db` at all.** `scripts/run-suites.mjs`
gives each lane its own `prisma/dev-shard-N.db` and pushes + seeds it itself, so
a worktree with no `dev.db` runs the whole blocking battery cleanly. Worth
knowing because `npm run db:reset` and a bare `prisma db push` are both refused
by the permission classifier as destructive, and that is not a blocker for
testing — only for `npm run dev`.
