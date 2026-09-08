-- A class belongs to its SCHOOL, not only to whoever holds it
-- (docs/paid-tier-plan.md item 1; docs/dpo-decisions.md 29 Aug 2026, whose
-- widening this retires by its own terms).
--
--   Class.schoolId              the school, independently of the teacher.
--                               SET NULL, never CASCADE: a school row must never
--                               be able to take a school's classes, pupils and
--                               photographs with it (the shape of F68, larger).
--   Class.broughtInByTeacherId  written ONLY by joinSchoolPlan, for the classes
--                               a teacher arrived with. Read with teacherId, so
--                               a class the school reassigned is the school's.
--   Class.academicYear          free text, e.g. "2026-27". Never infers ageMode.
--   Class.archivedAt            a class that has stopped teaching. ARCHIVED IS
--                               NOT DELETED — the children and their work are
--                               all still here.
--
-- SQLite cannot add a foreign key in place, so Prisma rebuilds the table. Every
-- id is carried across unchanged, which is what keeps Student, JournalItem,
-- Draft, Assignment and MessageThread pointing at the same rows. Existing
-- classes get NULL in all four columns: no class belongs to a school until
-- something says so, which is rule 8 rather than a backfill nobody reviewed.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Class" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "yearGroup" TEXT,
    "ageMode" TEXT,
    "classCode" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT,
    "broughtInByTeacherId" TEXT,
    "academicYear" TEXT,
    "archivedAt" DATETIME,
    CONSTRAINT "Class_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Class_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Class" ("ageMode", "classCode", "createdAt", "id", "name", "teacherId", "yearGroup") SELECT "ageMode", "classCode", "createdAt", "id", "name", "teacherId", "yearGroup" FROM "Class";
DROP TABLE "Class";
ALTER TABLE "new_Class" RENAME TO "Class";
CREATE UNIQUE INDEX "Class_classCode_key" ON "Class"("classCode");
CREATE INDEX "Class_schoolId_idx" ON "Class"("schoolId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- ---------------------------------------------------------------------------
-- TWO BACKFILLS, AND THEY GO IN OPPOSITE DIRECTIONS ON PURPOSE.
-- ---------------------------------------------------------------------------

-- 1. `schoolId` IS BACKFILLED, because leaving it NULL would not be caution, it
--    would be a change of meaning. A class held today by a teacher who is staff
--    of a school IS that school's class — that is precisely what the product has
--    meant since there were schools, and it is the sentence
--    src/app/actions/billing.ts wrote when it said "the whole of 'her classes
--    became the school's' is ONE Teacher.schoolId write". Writing NULL instead
--    would hand every live school's classes to individuals the first time the
--    lapse detach ran.
UPDATE "Class"
   SET "schoolId" = (SELECT "schoolId" FROM "Teacher" WHERE "Teacher"."id" = "Class"."teacherId")
 WHERE (SELECT "schoolId" FROM "Teacher" WHERE "Teacher"."id" = "Class"."teacherId") IS NOT NULL;

-- 2. `broughtInByTeacherId` IS BACKFILLED ONLY FROM A STRUCTURED RECORD, never
--    guessed. `CLASS_JOINED_SCHOOL` is written once per class by joinSchoolPlan
--    at the moment a teacher brings her classes in, with subjectId = the class
--    and actorId = her; it is the record this column replaces, and reading its
--    two id columns is not the same as parsing its prose (which is what
--    src/app/admin/page.tsx has to do for the "inherited" flag, and why that is
--    noted as fragile).
--
--    AND ONLY WHERE SHE STILL HOLDS IT. If the school reassigned the class to a
--    colleague, the school exercised control over it and it is the school's.
--    That compound condition is the same one the detach reads, so the backfill
--    and the runtime rule cannot disagree.
--
--    A class with no such row keeps NULL, which resolves to "the school's". That
--    is the more protective answer of the two (SAFEGUARDING rule 8): the failure
--    it prevents is a school's children being handed to one adult by mistake,
--    and the failure it accepts is a teacher having to ask for classes she can
--    still read.
UPDATE "Class"
   SET "broughtInByTeacherId" = "teacherId"
 WHERE "schoolId" IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM "AuditLog"
      WHERE "AuditLog"."action" = 'CLASS_JOINED_SCHOOL'
        AND "AuditLog"."subjectType" = 'CLASS'
        AND "AuditLog"."subjectId" = "Class"."id"
        AND "AuditLog"."actorId" = "Class"."teacherId"
   );
