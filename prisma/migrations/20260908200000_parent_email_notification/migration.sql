-- "Tell me when there is a message" (SAFEGUARDING rule 6a).
--
--   Parent.notifyByEmail   off for everybody, and only the parent may change it.
--   Message.notifiedAt     when the notification question for this message was
--                          settled, or NULL if it has not been.
--
-- WHY notifyByEmail IS NOT NULLABLE, unlike every other opt-in column added
-- recently. There is no third state. A parent has asked or they have not, and
-- "not yet decided" is the same as "no" for a rule whose whole content is that
-- StoryJar sends nothing a person did not ask for. `DEFAULT false` therefore
-- backfills every existing row to exactly the right answer, and no existing
-- household starts getting email because this migration ran.
--
-- WHY notifiedAt IS ON THE MESSAGE AND NOT ON THE PARENT. Two paths raise
-- notifications — a lazy one when a member of staff opens their inbox, and the
-- nightly sweep in scripts/freeze-expired.mjs — and on an ordinary morning they
-- race. A stamp on the row is what makes "tell the family once" a property of
-- the data rather than of whichever path happened to run first.
--
-- It is stamped even when nothing is sent: a parent with the switch off, no
-- address on file, or a suppressed one. The question the column answers is "has
-- this message been considered?" — re-asking it every night forever is how a
-- switch turned on in March produces a flood of email about February.
--
-- It is NOT a delivery receipt, and nothing in StoryJar is: open and click
-- tracking are off at account level and on every message, and no event webhook
-- is wired (see MAIL_OUTCOMES in src/lib/mailStatus.ts).
--
-- Two nullable-or-defaulted columns, no table, nothing rewritten.

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "notifiedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Parent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT false,
    "familyCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Parent" ("createdAt", "email", "familyCode", "id", "name") SELECT "createdAt", "email", "familyCode", "id", "name" FROM "Parent";
DROP TABLE "Parent";
ALTER TABLE "new_Parent" RENAME TO "Parent";
CREATE UNIQUE INDEX "Parent_email_key" ON "Parent"("email");
CREATE UNIQUE INDEX "Parent_familyCode_key" ON "Parent"("familyCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

