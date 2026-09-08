-- A school can close its own account (docs/paid-tier-plan.md; the business
-- manager's "the only route I can see is emailing somebody and hoping").
--
--   School.closedAt          when the school gave the instruction
--   School.closedByTeacherId which admin gave it
--   School.closureReason     their own sentence about why
--
-- CLOSING IS NOT DELETING. Handbook R12 forbids every deletion path until a
-- restore has been rehearsed (docs/restore-rehearsal.md), and owner decision D5
-- says school deletion does not exist in v1. A closed school is frozen and its
-- staff detached; every row and every file stays exactly where it is, on
-- RETENTION.md's schedule. These three columns are the INSTRUCTION, with a date
-- on it, which is what a school asking to leave never had before.

-- AlterTable
ALTER TABLE "School" ADD COLUMN "closedAt" DATETIME;
ALTER TABLE "School" ADD COLUMN "closedByTeacherId" TEXT;
ALTER TABLE "School" ADD COLUMN "closureReason" TEXT;

