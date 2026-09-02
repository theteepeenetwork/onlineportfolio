---
name: project-proving-a-migration-offline
description: how to prove a Prisma migration in this repo without prisma migrate dev — replay the chain, diff for empty, and turn FK enforcement ON or the cascade proof is fake
metadata:
  type: project
---

**A migration here is proved on a scratch database, never with
`prisma migrate dev` or `db push --force-reset`.** Three steps, and the third
is the one that silently lies.

1. **Replay the committed chain.** `sqlite3 <scratch.db> < migration.sql` for
   every directory under `prisma/migrations/` in sorted order, new one last. A
   failure names the migration that broke.
2. **Diff for empty.** `npx prisma migrate diff --from-migrations
   prisma/migrations --to-schema-datamodel prisma/schema.prisma
   --shadow-database-url file:<abs tmp> --script` must print
   *"This is an empty migration."* — that is the same drift
   `tests/battery/security/migrations-match-schema.spec.ts` asserts. **Delete
   the shadow file between runs**: with `--script` an existing file fails
   confusingly rather than clearly.
3. **`PRAGMA foreign_keys = ON;` in every sqlite3 statement that exercises a
   cascade.** SQLite has foreign keys OFF by default and the pragma is
   *per-connection*, so a delete test written without it passes while proving
   nothing — the rows just go, whatever the constraint says. With it on, a
   `DELETE FROM "Teacher"` really does null a `SET NULL` pointer and really
   does cascade the dependent rows, and a duplicate insert really does hit the
   unique index.

**Why:** there is no `prisma/dev.db` in a fresh worktree, and seeds run under
`db push`, which builds the schema directly and never applies migrations — so a
seeded database is not evidence about a migration at all. See
[[project-shared-dev-db]].

**How to apply:** on any `prisma/migrations/` change. Report the replay result,
the empty diff, and the constraint behaviours you actually exercised, not just
that the file exists. A schema change also makes `select-suites.mjs` pick
everything (~9 min), so batch the work.
