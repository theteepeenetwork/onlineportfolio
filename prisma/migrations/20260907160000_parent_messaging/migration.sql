-- Parent–teacher messages, held to the school's office hours (SAFEGUARDING.md
-- rule 21; RETENTION.md "Parent–teacher messages"; docs/DPIA.md R18).
--
--   Teacher.mayMessageParents  NULL = role default (TEACHER/ADMIN yes, TA no);
--                              an admin's per-staff override otherwise.
--   MessagingPolicy            one per school: the switch (default OFF) and zone.
--   OfficeHourWindow           one per open weekday; no row = closed that day.
--   OfficeHoursClosure         INSET days and holidays.
--   MessageThread              one per child; handler/closed/passed state.
--   MessageThreadShare         a colleague given the thread.
--   Message                    text only; deliverAt is the hard rule.
--
-- Everything cascades from the child (Student), the class and the school.
-- Sender references are SET NULL so a thread stays whole after a guardian or a
-- member of staff is erased.

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "mayMessageParents" BOOLEAN;

-- CreateTable
CREATE TABLE "MessagingPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "updatedAt" DATETIME NOT NULL,
    "updatedByTeacherId" TEXT,
    CONSTRAINT "MessagingPolicy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessagingPolicy_updatedByTeacherId_fkey" FOREIGN KEY ("updatedByTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfficeHourWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "openMinute" INTEGER NOT NULL,
    "closeMinute" INTEGER NOT NULL,
    CONSTRAINT "OfficeHourWindow_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "MessagingPolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfficeHoursClosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "OfficeHoursClosure_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "MessagingPolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" DATETIME,
    "closedAt" DATETIME,
    "closedByTeacherId" TEXT,
    "handlerTeacherId" TEXT,
    "passedAt" DATETIME,
    "handoverReason" TEXT,
    CONSTRAINT "MessageThread_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageThread_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageThread_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageThread_closedByTeacherId_fkey" FOREIGN KEY ("closedByTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MessageThread_handlerTeacherId_fkey" FOREIGN KEY ("handlerTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageThreadShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "sharedByTeacherId" TEXT,
    "sharedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageThreadShare_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageThreadShare_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MessageThreadShare_sharedByTeacherId_fkey" FOREIGN KEY ("sharedByTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderParentId" TEXT,
    "senderTeacherId" TEXT,
    "messageBody" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliverAt" DATETIME NOT NULL,
    "readByParentAt" DATETIME,
    "readByTeacherAt" DATETIME,
    CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_senderParentId_fkey" FOREIGN KEY ("senderParentId") REFERENCES "Parent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_senderTeacherId_fkey" FOREIGN KEY ("senderTeacherId") REFERENCES "Teacher" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MessagingPolicy_schoolId_key" ON "MessagingPolicy"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeHourWindow_policyId_weekday_key" ON "OfficeHourWindow"("policyId", "weekday");

-- CreateIndex
CREATE INDEX "OfficeHoursClosure_policyId_date_idx" ON "OfficeHoursClosure"("policyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OfficeHoursClosure_policyId_date_key" ON "OfficeHoursClosure"("policyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThread_studentId_key" ON "MessageThread"("studentId");

-- CreateIndex
CREATE INDEX "MessageThread_schoolId_lastMessageAt_idx" ON "MessageThread"("schoolId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "MessageThread_classId_idx" ON "MessageThread"("classId");

-- CreateIndex
CREATE INDEX "MessageThreadShare_teacherId_idx" ON "MessageThreadShare"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageThreadShare_threadId_teacherId_key" ON "MessageThreadShare"("threadId", "teacherId");

-- CreateIndex
CREATE INDEX "Message_threadId_deliverAt_idx" ON "Message"("threadId", "deliverAt");

