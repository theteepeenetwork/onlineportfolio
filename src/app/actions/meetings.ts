"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getCurrentParent } from "@/lib/parentAuth";
import { recordAudit } from "@/lib/audit";
import { schoolMessaging } from "@/lib/messaging/policy";
import {
  eveningErrorMessage,
  eveningLabel,
  isSchoolClosedOn,
  parseClock,
  slotInstant,
  slotLabel,
  slotMinutesFor,
  validateEvening,
} from "@/lib/meetings";

// ===========================================================================
// Parents' evening — laying one out, and taking an appointment.
//
// WHO MAY DO WHAT:
//   • A school ADMIN lays out an evening for classes of their own school.
//   • A linked PARENT takes one free appointment for one of their own children,
//     and may move or give it up until the evening.
//   • A class TEACHER reads their own list (a page, not an action).
//   • The admin who set it up sees counts per class, never a child.
//
// TWO PARENTS, ONE SLOT, ONE WINNER. Booking is a CONDITIONAL UPDATE —
// `updateMany({ where: { id, studentId: null }, … })` — which returns 1 for the
// first family and 0 for the second, so the database decides rather than a check
// that was true a moment ago. A `create` here would let both succeed and leave
// the school to notice on the night. This is the same shape `bookedAt` has in
// every seat-booking system that works, and the reason the column is nullable on
// a row the school creates rather than a row the family creates.
//
// NO OFFICE-HOURS HOLD, and it is not an oversight: rule 21's hold exists so a
// teacher's evening is not a workplace, and a parents' evening is the one night
// the school has asked them to be there. `src/lib/meetings.ts` argues that at
// length and holds StoryJar's own bounds instead.
// ===========================================================================

export type MeetingState = { error?: string; done?: string };

const MAX_TITLE = 120;

/** A school lays out an evening: one row per appointment, per class. */
export async function createMeetingEvent(_prev: MeetingState | undefined, formData: FormData): Promise<MeetingState> {
  const { teacherId, schoolId, actorName } = await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "").trim();
  const startMinute = parseClock(String(formData.get("startTime") ?? ""));
  const endMinute = parseClock(String(formData.get("endTime") ?? ""));
  const slotMinutes = Number(formData.get("slotMinutes") ?? 10);
  const opensRaw = String(formData.get("opensAt") ?? "").trim();
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);

  if (!title) return { error: "Give the evening a name — something a parent will recognise." };
  if (title.length > MAX_TITLE) return { error: "That name is a little long — 120 characters or fewer, please." };
  if (classIds.length === 0) return { error: "Choose at least one class." };
  if (startMinute === null || endMinute === null) return { error: eveningErrorMessage("BAD_TIME") };

  const shape = { eventDate, startMinute, endMinute, slotMinutes };
  const bad = validateEvening(shape);
  if (bad) return { error: eveningErrorMessage(bad) };

  // Every class resolved WITH the school, never by id alone (rule 8). A posted
  // id that is not this school's simply does not come back, and the count check
  // is what turns that into a refusal rather than a partial evening.
  const classes = await db.class.findMany({
    where: { id: { in: classIds }, schoolId, archivedAt: null },
    select: { id: true, name: true, teacherId: true },
  });
  if (classes.length !== classIds.length) return { error: "One of those classes isn't one of yours." };

  // The school's own closed days, read from the messaging policy because that is
  // where a school already tells StoryJar which days it is shut. A REFUSAL, not
  // a warning: an evening on an INSET day is a mistake somebody would find by
  // standing in an empty hall.
  const messaging = await schoolMessaging(schoolId);
  if (isSchoolClosedOn(eventDate, messaging.policy.closures)) {
    return { error: `Your school is marked closed on ${eveningLabel(eventDate)}. Take that day off the closed list first, or pick another evening.` };
  }

  const opensAt = opensRaw ? new Date(`${opensRaw}T00:00:00`) : null;
  if (opensAt && Number.isNaN(opensAt.getTime())) return { error: "That opening date doesn't look like a date." };

  const minutes = slotMinutesFor(shape);
  const timezone = messaging.policy.timezone;

  const event = await db.$transaction(async (tx) => {
    const created = await tx.meetingEvent.create({
      data: {
        schoolId,
        title,
        eventDate,
        slotMinutes,
        opensAt,
        createdByTeacherId: teacherId,
        // Snapshotted, so the record still reads correctly after the admin
        // leaves — the `SchoolInvitation.invitedByName` precedent.
        createdByName: actorName,
      },
      select: { id: true },
    });
    // One empty row per appointment per class. Empty rows name nobody; a family
    // fills one in. Creating them here is what makes booking a conditional
    // UPDATE rather than a create, which is the whole double-booking argument.
    await tx.meetingSlot.createMany({
      data: classes.flatMap((c) =>
        minutes.map((m) => ({
          eventId: created.id,
          teacherId: c.teacherId,
          classId: c.id,
          startsAt: slotInstant(eventDate, m, timezone),
        })),
      ),
    });
    return created;
  });

  await recordAudit({
    action: "MEETING_EVENT_CREATED",
    actorType: "ADMIN",
    actorId: teacherId,
    actorName,
    schoolId,
    subjectType: "SCHOOL",
    subjectId: schoolId,
    detail: `${actorName} set up "${title}" on ${eveningLabel(eventDate)} — ${minutes.length} appointment${minutes.length === 1 ? "" : "s"} each for ${classes.map((c) => c.name).join(", ")}.`,
  });

  revalidatePath("/admin");
  revalidatePath("/family");
  revalidatePath("/teacher/meetings");
  return {
    done: `Set up. ${minutes.length * classes.length} appointment${minutes.length * classes.length === 1 ? "" : "s"} across ${classes.length} ${classes.length === 1 ? "class" : "classes"}.`,
  };
}

/** A family takes one free appointment for one of their own children. */
export async function bookMeetingSlot(_prev: MeetingState | undefined, formData: FormData): Promise<MeetingState> {
  const parent = await getCurrentParent();
  if (!parent) redirect("/family");

  const slotId = String(formData.get("slotId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");

  // BOTH ENDS RESOLVED FROM THE SESSION AND THE LINK, never from the form alone.
  const child = parent.children.find((c) => c.id === studentId);
  if (!child) return { error: "That isn't one of your children." };

  // The slot must belong to an evening for THIS child's class. Resolved by
  // (id, classId) together: an id from another school's evening finds nothing,
  // and finding nothing is the same generic refusal as finding a taken one.
  const slot = await db.meetingSlot.findFirst({
    where: { id: slotId, class: { students: { some: { id: studentId } } } },
    select: {
      id: true,
      startsAt: true,
      eventId: true,
      classId: true,
      event: { select: { id: true, title: true, eventDate: true, opensAt: true, schoolId: true } },
    },
  });
  if (!slot) return { error: "That appointment isn't one of yours." };

  if (slot.event.opensAt && slot.event.opensAt > new Date()) {
    return { error: `Booking for this evening opens on ${eveningLabel(slot.event.opensAt.toISOString().slice(0, 10))}.` };
  }

  const outcome = await db.$transaction(async (tx) => {
    // ONE APPOINTMENT PER CHILD PER EVENING. A family with two children gets
    // two, one each; a family pressing twice for the same child moves rather
    // than accumulating, because a second appointment is one the rest of the
    // class cannot have.
    const held = await tx.meetingSlot.findFirst({
      where: { eventId: slot.eventId, studentId },
      select: { id: true, startsAt: true },
    });
    if (held && held.id !== slot.id) {
      const freed = await tx.meetingSlot.updateMany({
        where: { id: held.id, studentId },
        data: { studentId: null, parentId: null, bookedAt: null },
      });
      if (freed.count !== 1) return "RACE" as const;
    }
    // THE CONDITIONAL UPDATE. `studentId: null` in the WHERE is the whole
    // control: the second family to press gets count 0 and is told so, rather
    // than both being told yes and the school finding out on the night.
    const taken = await tx.meetingSlot.updateMany({
      where: { id: slot.id, studentId: null },
      data: { studentId, parentId: parent.id, bookedAt: new Date() },
    });
    return taken.count === 1 ? ("BOOKED" as const) : ("TAKEN" as const);
  });

  if (outcome === "TAKEN") {
    return { error: "Somebody took that time just before you did. Please choose another." };
  }
  if (outcome === "RACE") {
    return { error: "Something moved while you were booking. Have another look at the times." };
  }

  await recordAudit({
    action: "MEETING_BOOKED",
    actorType: "PARENT",
    actorId: parent.id,
    schoolId: slot.event.schoolId,
    subjectType: "STUDENT",
    subjectId: studentId,
    // `subjectType: "STUDENT"` puts this in the admin console's redaction set,
    // so an admin who does not teach this class sees the who, the what and the
    // when without the child (rule 5). The TIME is not in the detail either: the
    // teacher's own list is where a school reads who is coming when, and an
    // audit line carrying it would be a second copy on a different clock.
    detail: `A family booked a place at "${slot.event.title}".`,
  });

  revalidatePath("/family");
  revalidatePath("/admin");
  revalidatePath("/teacher/meetings");
  return { done: `Booked — ${slotLabel(slot.startsAt)} on ${eveningLabel(slot.event.eventDate)}. You can change it any time before the evening.` };
}

/** A family gives their appointment up. It goes straight back on the list. */
export async function cancelMeetingSlot(_prev: MeetingState | undefined, formData: FormData): Promise<MeetingState> {
  const parent = await getCurrentParent();
  if (!parent) redirect("/family");

  const slotId = String(formData.get("slotId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const child = parent.children.find((c) => c.id === studentId);
  if (!child) return { error: "That isn't one of your children." };

  const slot = await db.meetingSlot.findFirst({
    where: { id: slotId, studentId },
    select: { id: true, event: { select: { title: true, schoolId: true } } },
  });
  if (!slot) return { error: "That appointment isn't one of yours." };

  // Scoped on `studentId` in the WHERE as well as the SELECT, so a row that
  // changed hands between the read and the write is not cleared by the wrong
  // family (rule 8: deny rather than assume).
  const freed = await db.meetingSlot.updateMany({
    where: { id: slot.id, studentId },
    data: { studentId: null, parentId: null, bookedAt: null },
  });
  if (freed.count !== 1) return { error: "That appointment isn't one of yours." };

  await recordAudit({
    action: "MEETING_CANCELLED",
    actorType: "PARENT",
    actorId: parent.id,
    schoolId: slot.event.schoolId,
    subjectType: "STUDENT",
    subjectId: studentId,
    detail: `A family gave up their place at "${slot.event.title}".`,
  });

  revalidatePath("/family");
  revalidatePath("/admin");
  revalidatePath("/teacher/meetings");
  return { done: "Given up. That time is back on the list for another family." };
}
