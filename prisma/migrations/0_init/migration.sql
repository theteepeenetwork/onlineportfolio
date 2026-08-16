-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "displayStyle" TEXT NOT NULL DEFAULT 'formal',
    "displayName" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "schoolName" TEXT,
    "country" TEXT,
    "role" TEXT NOT NULL DEFAULT 'TEACHER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "foundingMember" BOOLEAN NOT NULL DEFAULT false,
    "schoolId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "trialEndsAt" DATETIME,
    "frozenAt" DATETIME,
    "currentPeriodEnd" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "teacherId" TEXT,
    "schoolId" TEXT,
    CONSTRAINT "Subscription_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subscription_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#C9C2B0',
    "teacherId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Folder_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "yearGroup" TEXT,
    "ageMode" TEXT,
    "classCode" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Class_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "avatarColor" TEXT NOT NULL DEFAULT '#4f46e5',
    "classId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jarSeenAt" DATETIME,
    CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Parent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "familyCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MagicToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MagicToken_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "caption" TEXT,
    "textContent" TEXT,
    "mediaPath" TEXT,
    "mediaPathsJson" TEXT,
    "quizAnswersJson" TEXT,
    "quizScore" INTEGER,
    "quizTotal" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "authorRole" TEXT NOT NULL,
    "teacherNote" TEXT,
    "stickersJson" TEXT,
    "praiseNote" TEXT,
    "stickerReply" TEXT,
    "returnMode" TEXT,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" DATETIME,
    "assignmentId" TEXT,
    CONSTRAINT "JournalItem_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalItem_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "templatePathsJson" TEXT,
    "quizJson" TEXT,
    "objectsJson" TEXT,
    "tagsJson" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "teacherId" TEXT NOT NULL,
    "folderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityTemplate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityTemplate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "wholeClass" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "templateSnapshotJson" TEXT,
    "quizSnapshotJson" TEXT,
    "objectsSnapshotJson" TEXT,
    "dueDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ActivityTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surface" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "pagesJson" TEXT,
    "fieldsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "teacherId" TEXT,
    "studentId" TEXT,
    "classId" TEXT,
    "assignmentId" TEXT,
    CONSTRAINT "Draft_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Draft_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Draft_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Draft_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssignmentStudent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssignmentStudent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssignmentStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "teacherId" TEXT,
    "studentId" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schoolId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "detail" TEXT
);

-- CreateTable
CREATE TABLE "_ParentChildren" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ParentChildren_A_fkey" FOREIGN KEY ("A") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ParentChildren_B_fkey" FOREIGN KEY ("B") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_JournalItemSkills" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_JournalItemSkills_A_fkey" FOREIGN KEY ("A") REFERENCES "JournalItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_JournalItemSkills_B_fkey" FOREIGN KEY ("B") REFERENCES "Skill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_email_key" ON "Teacher"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_teacherId_key" ON "Subscription"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_schoolId_key" ON "Subscription"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_classCode_key" ON "Class"("classCode");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_email_key" ON "Parent"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Parent_familyCode_key" ON "Parent"("familyCode");

-- CreateIndex
CREATE UNIQUE INDEX "MagicToken_token_key" ON "MagicToken"("token");

-- CreateIndex
CREATE INDEX "Draft_expiresAt_idx" ON "Draft"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_surface_contextKey_ownerKey_key" ON "Draft"("surface", "contextKey", "ownerKey");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentStudent_assignmentId_studentId_key" ON "AssignmentStudent"("assignmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_at_idx" ON "AuditLog"("schoolId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "_ParentChildren_AB_unique" ON "_ParentChildren"("A", "B");

-- CreateIndex
CREATE INDEX "_ParentChildren_B_index" ON "_ParentChildren"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_JournalItemSkills_AB_unique" ON "_JournalItemSkills"("A", "B");

-- CreateIndex
CREATE INDEX "_JournalItemSkills_B_index" ON "_JournalItemSkills"("B");

