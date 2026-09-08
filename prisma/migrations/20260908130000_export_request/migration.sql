-- A school asks one of its teachers for a copy of a class's data
-- (docs/paid-tier-plan.md item 3).
--
-- The admin ASKS, the teacher who holds the class FULFILS. The admin sees that
-- the request was made and whether it is done, never what is inside — because
-- SAFEGUARDING rule 5 says an admin never sees a child's work, and the export
-- route is scoped to the class's own teacher. This table is the request, and it
-- is the only new thing needed to close the gap between "the office receives the
-- subject access request" and "the person who may answer it knows about it".
--
-- `requestReason` is free text an adult writes and will sometimes name a child
-- in, which is why this table is CREDENTIAL_NEVER in the ops blindness gate and
-- the field is denied there by name as well — the same reasoning as
-- MessageThread.handoverReason.

-- CreateTable
CREATE TABLE "ExportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "requestedByTeacherId" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "requestReason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" DATETIME,
    CONSTRAINT "ExportRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExportRequest_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExportRequest_schoolId_fulfilledAt_idx" ON "ExportRequest"("schoolId", "fulfilledAt");

-- CreateIndex
CREATE INDEX "ExportRequest_classId_idx" ON "ExportRequest"("classId");

