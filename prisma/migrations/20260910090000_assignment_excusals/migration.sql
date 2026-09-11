-- "Not needed": a teacher takes one activity off one pupil's to-do list
-- (teacher feedback, item 5), and can put it back.
--
--   AssignmentExcusal   which run, which pupil, when. Nothing else.
--
-- THERE IS NO REASON COLUMN, and that is the feature. The reason a child missed
-- an activity is very often that they were ill; a free-text field beside a
-- child's name is where health data gets written by accident.
--
-- One row per (run, pupil). It cascades from both, so it never outlives either,
-- and it is deleted when the teacher puts the activity back or when the pupil
-- hands something in for it anyway (RETENTION.md, "Not needed" marks).
--
-- Generated with `prisma migrate diff --from-migrations prisma/migrations
-- --to-schema-datamodel prisma/schema.prisma --script`, and additive only: no
-- existing table or row is touched.

-- CreateTable
CREATE TABLE "AssignmentExcusal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssignmentExcusal_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssignmentExcusal_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentExcusal_assignmentId_studentId_key" ON "AssignmentExcusal"("assignmentId", "studentId");
