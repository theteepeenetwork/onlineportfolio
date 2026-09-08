-- Parents' evening: a school lays out appointments, a family takes one.
--
--   MeetingEvent  the evening itself — its name, its date, how long a slot is,
--                 and when booking opens. NO child, NO parent, NO teacher but
--                 the admin who created it. `eventDate` is "YYYY-MM-DD" in the
--                 school's own zone, the same shape MessagingPolicy.closures
--                 uses: a calendar date is a wall-clock fact about a school
--                 day, not an instant. The instants are on the slots.
--   MeetingSlot   one appointment. Empty it names nobody; taken it names a
--                 CHILD and a FAMILY, which is why the two tables sit in
--                 different classes of the operator blindness gate.
--
-- WHY THE UNIQUE INDEX IS ON (eventId, teacherId, startsAt). It is not about
-- double-booking — that is handled by the conditional update in
-- src/app/actions/meetings.ts, `where: { id, studentId: null }`, which returns 1
-- for the first family and 0 for the second. This index is about a school
-- pressing "lay out the slots" twice and a teacher ending up with two of every
-- appointment.
--
-- WHY studentId AND parentId ARE SET NULL AND NOT CASCADE, and it is the
-- opposite choice from ConsentResponse one migration earlier. A consent answer
-- is worthless without the child, so it goes with them. An appointment on an
-- evening that is still happening is worth exactly what it was before anybody
-- booked it, so a child who leaves the school FREES the slot rather than
-- deleting the school's own appointment.
--
-- Everything else cascades from the row it cannot outlive: a slot from its
-- event, its teacher (like Class.teacher) and its class; an event from its
-- school.

-- CreateTable
CREATE TABLE "MeetingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "eventDate" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 10,
    "opensAt" DATETIME,
    "createdByTeacherId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "studentId" TEXT,
    "parentId" TEXT,
    "bookedAt" DATETIME,
    CONSTRAINT "MeetingSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MeetingEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingSlot_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingSlot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MeetingSlot_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MeetingEvent_schoolId_eventDate_idx" ON "MeetingEvent"("schoolId", "eventDate");

-- CreateIndex
CREATE INDEX "MeetingSlot_classId_idx" ON "MeetingSlot"("classId");

-- CreateIndex
CREATE INDEX "MeetingSlot_studentId_idx" ON "MeetingSlot"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSlot_eventId_teacherId_startsAt_key" ON "MeetingSlot"("eventId", "teacherId", "startsAt");

