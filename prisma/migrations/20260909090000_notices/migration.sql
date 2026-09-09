-- Notices: one-way, from the school to families, with no way to respond
-- (SAFEGUARDING rule 24).
--
--   Notice        the school's own words, who sent them and to whom, and
--                 whether they were taken down. NO child, NO parent.
--                 `noticeBody` and not `body`: the ops gate denies `body`.
--   NoticeClass   which classes a "CLASSES" notice went to. Two ids.
--
-- THERE IS NO REPLY TABLE, and that is the feature rather than an omission. A
-- family's "no way to respond" is the absence of anything to post to, not a
-- button that has been hidden. A whole-school notice has no NoticeClass rows
-- and is resolved at read time from Class.schoolId, so a child who joins next
-- week sees last week's notice — right for a notice board.
--
-- Taking a notice down is a stamp (`retractedAt`), never a delete: it stops
-- showing to families and stays on the staff side, so the record of what
-- families were told is the school's.
--
-- Everything cascades from the row it cannot outlive: a notice from its school,
-- a class link from its notice and its class.

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "noticeBody" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "sentByTeacherId" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "sentByRole" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retractedAt" DATETIME,
    "retractedByName" TEXT,
    CONSTRAINT "Notice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoticeClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noticeId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    CONSTRAINT "NoticeClass_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoticeClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Notice_schoolId_createdAt_idx" ON "Notice"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "NoticeClass_classId_idx" ON "NoticeClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeClass_noticeId_classId_key" ON "NoticeClass"("noticeId", "classId");

