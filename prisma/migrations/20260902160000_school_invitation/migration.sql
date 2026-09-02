-- The offer a school makes to a teacher WHO ALREADY HAS AN ACCOUNT.
--
-- WHAT THIS CHANGE IS FOR. `inviteStaff` (src/app/actions/admin.ts) refuses an
-- email that already belongs to a teacher, flatly, because the only thing it
-- knows how to do is create a teacher row. So a teacher who signed up free in
-- September cannot be brought into their school when it buys in January. That
-- is the ordinary case, not an edge one, and it is the last thing standing
-- between a school paying and its staff using what it paid for.
-- docs/dpo-decisions.md, 1 September 2026; docs/paid-tier-plan.md.
--
-- ADDITIVE ONLY. One new table, one unique index, three foreign keys. No column
-- on an existing table is added, altered, narrowed or dropped, so there is no
-- RedefineTables rewrite of `Teacher` or `School`, no backfill, and nothing
-- here can fail against the populated production database. Every existing row
-- is untouched, and every teacher and school comes out of it exactly as they
-- went in: the absence of an invitation is the state everybody is already in.
--
-- WHO IT IS NULL FOR. Nobody — the table starts empty and stays empty until an
-- admin invites somebody who already has an account. Within a row,
-- `invitedByTeacherId` is null once the inviter's account is gone (see the
-- foreign keys below), and `respondedAt` is null for as long as the offer is
-- unanswered. Both are real states rather than missing values.
--
-- ---------------------------------------------------------------------------
-- THERE IS NO SECRET COLUMN, AND THAT IS THE DESIGN
-- ---------------------------------------------------------------------------
-- No `*Hash`, no `*Token`, no `*Code`. This is NOT the shape of
-- TeacherPasswordToken next door and it must not be made to resemble it.
--
-- The reason is the owner decision of 1 September 2026: the invitation is
-- answered IN THE APP BY THE SIGNED-IN ACCOUNT HOLDER. The invitee already has
-- an account and is already authenticated when they answer, so there is nobody
-- for a bearer token to be issued to, and a mailed secret would be a second way
-- in to an account that already has one. An `inviteCode` "so it can be
-- forwarded to a colleague" would recreate — after MagicToken and
-- TeacherPasswordToken — the third bearer credential in this product, on the
-- single highest-value action in it: accepting hands a school authority over
-- this teacher's classes and the children in them.
--
-- ---------------------------------------------------------------------------
-- THE ALTERNATIVE THAT WAS REJECTED
-- ---------------------------------------------------------------------------
-- Two or three columns on `TeacherPasswordToken` and a fourth `purpose` value,
-- which would have been no new table at all and looked like the cheaper change.
--
-- It is a live bug rather than a stylistic objection. `mintPasswordToken`
-- (src/lib/passwordTokens.ts) SPENDS every unspent token in the
-- password-setting pool each time it mints another. An invitation filed there
-- would be cancelled silently the next time the teacher asked for a password
-- reset, and the banner offering it would disappear with nothing on any screen
-- explaining why. That exact edge was hit one migration ago by CONFIRM
-- (20260902150000_teacher_email_confirmation), which is why confirmation was
-- given its own pool.
--
-- A pool is the right answer there, because a confirmation is still a mailed
-- secret with a lifetime. It is the wrong answer here: an invitation is not a
-- secret at all, and a table whose entire purpose is "single-use expiring
-- credential, stored as a digest, deleted with the account" is the wrong place
-- for a record that a school and a teacher both need to be able to look at.
--
-- ---------------------------------------------------------------------------
-- THE SHAPE, AND WHY EACH PIECE IS AS IT IS
-- ---------------------------------------------------------------------------
-- `role`   ADMIN | TEACHER | TA. The same closed vocabulary as `Teacher.role`,
--          in the same words, because it is copied onto the teacher on accept.
--          SQLite has no enum; the check is in
--          src/lib/schoolInvitationPolicy.ts.
--
-- `state`  PENDING | ACCEPTED | DECLINED | REVOKED | SUPERSEDED. There is
--          deliberately NO `EXPIRED`: expiry is a past `expiresAt`, read at the
--          moment of asking. A state would need a sweep to be true, a sweep
--          that stops running is a silent widening, and its absence looks
--          exactly like an offer that is still open.
--
-- `invitedName` / `invitedByName`
--          The names the admin typed, snapshotted — never rendered from the
--          Teacher rows. Rendering `Teacher.name` would disclose an adult's
--          name to somebody who supplied only an address, and would make a
--          pending invitation look different in the staff list from a fresh
--          INVITED row, which is the difference the four-case `inviteStaff`
--          branch exists to erase (FINDINGS F6, account existence).
--
-- ONE UNIQUE INDEX, ON (teacherId, schoolId), AND NO SECOND INDEX.
--   - One row per pair, mutated through states, so re-inviting is an upsert
--     back to PENDING with a fresh clock rather than a second row. History
--     lives in the audit log, which this codebase already treats as
--     authoritative: src/app/admin/page.tsx reconstructs class custody from
--     CLASS_ASSIGNED rows rather than from a column, for exactly this reason.
--   - teacherId LEADS because that is the lookup the teacher shell runs on
--     every navigation ("do I have an open offer?"), and a composite index is
--     usable on its leading column alone. The school's read is an admin opening
--     one page and scans a table holding one row per outstanding offer.
--   - NO GLOBAL UNIQUE ON teacherId. A supply teacher genuinely can be asked by
--     two schools at once; a unique constraint there would make the second
--     school's invitation fail with a database error instead of arriving. What
--     stops a teacher belonging to two schools is acceptance, not being asked.
--
-- THE THREE FOREIGN KEYS, AND THE TWO DIFFERENT ANSWERS THEY GIVE.
--   - schoolId  CASCADE. An offer to join a school that no longer exists is not
--     a record of anything.
--   - teacherId CASCADE, for the reason Session and TeacherPasswordToken
--     cascade: closing an account must not leave a live offer behind naming the
--     person who closed it.
--   - invitedByTeacherId SET NULL and nullable. An inviter can leave the school
--     or close their account, and neither of those may delete an offer somebody
--     is still holding. `invitedByName` is what makes SET NULL safe: the fact
--     "Mrs Lindqvist asked you to join Oakfield" survives Mrs Lindqvist, and
--     that sentence is what the acceptance screen must be able to say before a
--     teacher hands over their classes. Compare `School.claimedByTeacherId`,
--     which answers the same problem the other way round — no foreign key at
--     all, because there is no name column there to carry the fact.
--
-- ---------------------------------------------------------------------------
-- DPIA: CONSIDERED AND NOT REQUIRED, recorded here rather than left as absence
-- ---------------------------------------------------------------------------
-- Nothing about a child is stored, and nothing about an adult that the Teacher
-- rows at either end do not already hold: two foreign keys to teachers, one to
-- a school, a role from a three-word vocabulary, two names an admin typed, a
-- state from a five-word vocabulary and four timestamps. No address, no
-- credential, no free text a child's name can reach, no new sub-processor.
-- Rows are short-lived by construction (14 days, src/lib/schoolInvitationPolicy.ts)
-- and are deleted with either adult, or with the school, by the cascades above.
-- The processing this record ENABLES — a teacher's pupils passing from their
-- own responsibility to a school's — is the controller change already recorded
-- in docs/dpo-decisions.md (1 September 2026) and RETENTION.md
-- ("Individual vs school"). This table is the paperwork for it, not the act.
--
-- The ops blindness gate refused this model as OPS-MODEL-UNKNOWN until it was
-- classified in the same commit (ruling R2). It is LOOKUP_ONLY: an operator may
-- look one up and count them, and may not browse them and may not write one.
-- Ops needs nothing from this table, and that class permits exactly that
-- nothing; the argument, including why ADULT_READABLE was asked for and
-- refused, is beside the entry in scripts/check-ops-blindness.mjs. Two fixtures
-- prove the true positives still fire —
-- tests/fixtures/ops-blindness/bad-ops-deletes-school-invitation.txt for the
-- write and bad-ops-lists-school-invitations.txt for the browse.

-- CreateTable
CREATE TABLE "SchoolInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "invitedName" TEXT NOT NULL,
    "invitedByTeacherId" TEXT,
    "invitedByName" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SchoolInvitation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolInvitation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SchoolInvitation_invitedByTeacherId_fkey" FOREIGN KEY ("invitedByTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolInvitation_teacherId_schoolId_key" ON "SchoolInvitation"("teacherId", "schoolId");
