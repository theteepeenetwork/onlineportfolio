-- Storyjar Academy: two columns on School, one on SharedActivity.
--
-- HAND-WRITTEN, replacing what `prisma migrate diff` generated, and the reason
-- matters more than the SQL does.
--
-- Prisma's SQLite strategy for adding a column is "RedefineTables": create a
-- new table, copy every row across, DROP the old one, rename. It generated
-- exactly that here, for three columns that are nullable or carry a default.
--
-- That means a deploy would have dropped and recreated the School table, which
-- every Teacher row points at by foreign key, on a live database that FINDINGS
-- F20 records as having no backup and no point-in-time recovery. The pattern is
-- routine and it usually works. "Usually works" is a different standard from the
-- one this repository applies to children's data, and scripts/railway-start.sh
-- exists because a previous schema tool resolved an edit into whatever
-- statements reached the new shape, unattended, at whatever hour the deploy went
-- out.
--
-- SQLite has supported ALTER TABLE ADD COLUMN for a defaulted column for years.
-- It rewrites no rows, drops nothing, and cannot lose data if it fails halfway:
-- the column either exists or it does not. The resulting schema is identical,
-- which the A20 drift spec (tests/battery/security/migrations-match-schema.spec.ts)
-- checks by replaying these migrations and diffing against schema.prisma.
--
-- If a future migration genuinely needs a table rebuilt, that is a change to
-- make deliberately, with a rehearsed restore, not a side effect of adding a
-- boolean.
ALTER TABLE "School" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'SCHOOL';
ALTER TABLE "School" ADD COLUMN "canPublishToLibrary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SharedActivity" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'STORYJAR';
