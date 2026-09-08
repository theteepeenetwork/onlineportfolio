-- Escalation to a named safeguarding lead (SAFEGUARDING rule 21a).
--
--   Teacher.isSafeguardingLead   has the school NAMED this person a lead?
--   MessageThreadShare.raisedReason / raisedAt
--                                set only when the share was made by RAISING
--                                the conversation, rather than by an ordinary
--                                share.
--
-- WHY isSafeguardingLead IS NULLABLE WITH NO ROLE DEFAULT, unlike
-- `mayMessageParents` beside it. That column's NULL means "whatever the role
-- implies", which is right for a permission every teacher normally has. This
-- one's NULL means NOT A LEAD: nobody is a school's designated safeguarding
-- lead until an admin says who is. A default — every admin, or the head — would
-- put a real child's conversation in front of somebody the school never chose,
-- which is rule 8 in the one place a helpful default would be worst. It is
-- therefore NOT backfilled: every existing row stays NULL and every school
-- starts with no lead named, which is the true answer.
--
-- WHY THE REASON IS A COLUMN AND NOT AN AUDIT ROW. `raisedReason` is free text
-- a teacher writes about a named child — the most sensitive free text in the
-- product. It lives here, where it dies with the share and with the thread, and
-- NOT in AuditLog.detail, where it would be a second copy on the log's own
-- retention clock. That is the `handoverReason` precedent, word for word, and
-- the same argument that keeps message bodies out of the log. It is denied by
-- name in the operator blindness gate as well as by its model's class.
--
-- No table is created and nothing is rewritten: three nullable columns, so the
-- migration is additive and every existing row is already correct.

-- AlterTable
ALTER TABLE "MessageThreadShare" ADD COLUMN "raisedAt" DATETIME;
ALTER TABLE "MessageThreadShare" ADD COLUMN "raisedReason" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "isSafeguardingLead" BOOLEAN;

