-- Permission slips: a school asks, a household answers, one answer per child.
--
--   ConsentForm       the school's own words. NO child, NO parent, NO answer.
--                     `formBody` and not `body`, because the ops gate denies
--                     `body` by name and a denied identifier has to be one
--                     nothing else has a reason to use.
--   ConsentFormClass  which classes it went to. Two ids.
--   ConsentResponse   one household's answer for one child. UNIQUE per (form,
--                     child): two guardians do not get a vote each, the later
--                     answer stands, and a school chasing a slip sees one row
--                     per child rather than an argument.
--
-- THE ANSWER SET IS STORYJAR'S AND NEVER THE SCHOOL'S. `answer` holds one of the
-- values in src/lib/consent.ts and there is NO free-text field on a response
-- anywhere. SAFEGUARDING rule 19: a field recording something about the CHILD —
-- a health need, a diagnosis, ethnicity, religion — is special category data and
-- does not belong here. A school that could type its own answer labels would put
-- "nut allergy? yes/no" on a form within a term. The one extra answer allowed is
-- "my child needs a packed lunch provided", which is a catering headcount for a
-- free-school-meals child on a trip day and not a dietary record (owner
-- decision, 8 September 2026).
--
-- `ConsentResponse.parentId` is SET NULL, not cascade: closing a family space
-- must not take the school's record that permission was given.

-- CreateTable
CREATE TABLE "ConsentForm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "formBody" TEXT NOT NULL,
    "closesAt" DATETIME,
    "asksPackedLunch" BOOLEAN NOT NULL DEFAULT false,
    "createdByTeacherId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentForm_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsentFormClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    CONSTRAINT "ConsentFormClass_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ConsentForm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsentFormClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsentResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT,
    "answer" TEXT NOT NULL,
    "packedLunch" BOOLEAN NOT NULL DEFAULT false,
    "respondedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "ConsentForm" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsentResponse_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsentResponse_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ConsentForm_schoolId_createdAt_idx" ON "ConsentForm"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentFormClass_classId_idx" ON "ConsentFormClass"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentFormClass_formId_classId_key" ON "ConsentFormClass"("formId", "classId");

-- CreateIndex
CREATE INDEX "ConsentResponse_studentId_idx" ON "ConsentResponse"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentResponse_formId_studentId_key" ON "ConsentResponse"("formId", "studentId");

