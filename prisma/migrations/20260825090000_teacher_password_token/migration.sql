-- The single-use token that lets an adult set a password: one table behind both
-- "I have forgotten my password" and "a colleague has added you to this school".
-- Until now there was no reset path at all, and the invite email existed with
-- nothing to send it, so a pilot teacher locked out on a Monday morning was an
-- owner with an `ssh` session. FINDINGS F61.
--
-- ADDITIVE ONLY. One new table, one unique index, one foreign key. No column on
-- an existing table is altered, narrowed or dropped, so this applies to the
-- populated production database without touching a row that is already there —
-- which is what it has to do, with pilot teachers arriving from 1 September.
--
-- WHAT IS STORED IS A HASH, NOT THE TOKEN. `resetHash` is the SHA-256 hex digest
-- of the 24 random bytes that went out in the email; the raw token lives in that
-- message and in the request that spends it, and nowhere else. So reading this
-- table — from a stolen dev.db, from a backup whose country is still unconfirmed
-- (F20, F35), or under docs/exceptional-access.md — yields nothing that can be
-- replayed into somebody's account. Lookup is by the digest, so the unique index
-- below does the same work it would have done for a raw token. This DIVERGES
-- from MagicToken, which stores raw; the divergence is deliberate and the
-- reasoning is in prisma/schema.prisma beside the model.
--
-- DPIA: CONSIDERED AND NOT REQUIRED, recorded here rather than left as an
-- absence. Nothing about a child is stored, and nothing about an adult that the
-- Teacher row does not already hold: the columns are a digest of a random
-- number, a foreign key to a teacher, a purpose from a two-word vocabulary and
-- three timestamps. No address, no name, no free text, no new sub-processor. The
-- rows are short-lived by construction (30 minutes for a reset, 7 days for an
-- invite) and are deleted with the teacher by the cascade below, the same way
-- Session rows are.

-- CreateTable
CREATE TABLE "TeacherPasswordToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resetHash" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherPasswordToken_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherPasswordToken_resetHash_key" ON "TeacherPasswordToken"("resetHash");
