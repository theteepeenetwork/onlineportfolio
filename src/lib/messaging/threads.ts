import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireWritableAccountForClass } from "@/lib/billing";
import { deliveryTimeFor, describeOpening, hasAnyOpening, isOpenAt, nextOpeningAfter, type Policy } from "./officeHours";
import { messagingOpenForSending, resolveIsSafeguardingLead, resolveMayMessageParents, schoolMessaging, type SchoolMessaging } from "./policy";
import { sendMail } from "@/lib/mailer";
import { notifyDeliveredMessages } from "./notify";

// ===========================================================================
// Parent–teacher message threads: the ONLY module that reads or writes
// MessageThread, Message and MessageThreadShare.
//
// SAFEGUARDING.md rule 21. Two things are enforced here and nowhere else, which
// is why nothing else may touch these tables (scripts/audit-static.mjs checks):
//
//   1. THE HOLD. A message is never delivered outside the school's office
//      hours, in either direction. `deliverAt` is computed at insert from the
//      school's policy, and every read the OTHER SIDE gets filters on it. A
//      side always sees its own messages at once, labelled with when they
//      land; the other side sees nothing until `deliverAt` has passed. Time
//      passing is the only thing that delivers a message: no job, no cron.
//
//   2. WHO IS IN THE ROOM. A thread is about one child. Its readers are the
//      child's linked parents (rule 4: the parent↔child link) on one side and,
//      on the other, the class teacher via Class.teacherId — unless the
//      teacher has passed the family to a handler — the handler, and any
//      colleague the thread was shared with, each only while still staff of
//      the thread's school. No child session reaches any of this. No admin
//      reads a body (rule 5): the admin surface is metadata, in oversight.ts.
//
// AUTHORISATION IS DONE HERE, NOT BY THE CALLER. Every entry point takes the
// viewer's own id and the child's id, and resolves what that viewer may do
// through ownership-scoped queries. A caller never passes a thread id it got
// off a form; it passes the child, and this module decides.
// ===========================================================================

/**
 * Where an undelivered message waits when nothing can deliver it: the school
 * has switched messaging off, or has no office hours at all. Recomputed the
 * moment the policy changes, so this is a parking place, not a destination.
 */
export const HELD_INDEFINITELY = new Date("9999-12-31T00:00:00.000Z");

export const MAX_MESSAGE_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Shapes handed to pages. Dates are ISO strings so they cross to the client.
// ---------------------------------------------------------------------------

export type StaffReader = {
  id: string;
  /** The greeting name families know them by ("Mr Pearson"). */
  name: string;
  role: "CLASS_TEACHER" | "HANDLER" | "SHARED";
};

export type ThreadMessageView = {
  id: string;
  from: "PARENT" | "TEACHER";
  /** Who to show as the author, already worded for the viewer. */
  senderLabel: string;
  mine: boolean;
  messageBody: string;
  writtenAtISO: string;
  deliverAtISO: string;
  delivered: boolean;
  /** For a held message of the viewer's own side: "at 8:00am on Monday". */
  arrives: string | null;
};

export type ThreadView = {
  studentId: string;
  childName: string;
  className: string;
  /** Staff who can read this conversation, in the order a parent should see them. */
  readers: StaffReader[];
  /** The person a parent's message goes to, for the copy ("Mr Pearson will get this…"). */
  recipientName: string;
  closed: boolean;
  messages: ThreadMessageView[];
  /** May THIS viewer write right now (before the office-hours question)? */
  canSend: boolean;
  /** Plain-English reason when canSend is false and it is worth saying. */
  cannotSendReason: string | null;
  /** True when school hours are open at the moment of rendering. */
  openNow: boolean;
  /** When the next opening is, if shut now: "at 8:00am on Monday". */
  nextOpening: string | null;
  /** A one-line description of the hours, for the notice under the box. */
  hoursSummary: string;
};

export type SendResult =
  | { ok: true; held: boolean; arrives: string | null }
  | { ok: false; error: string };

// Copy. Plain English, no jargon (scripts/error-string-audit.mjs). The
// emergency line is a rule-21 constraint and is rendered by the composer
// itself; these are the refusals.
const NOT_AVAILABLE = "Messages aren’t switched on for this school.";
const NO_HOURS = "Your school has not set any office hours yet, so a message can’t be sent.";
const PAUSED = "The school’s StoryJar plan is paused, so new messages can’t be sent just now. You can still read what has been said.";
const CLOSED_THREAD = "The school has closed this conversation. Please contact the school office.";
const NOT_PERMITTED_STAFF = "You aren’t set up to message families. Ask your school admin if you think you should be.";
const EMPTY = "Write something first.";
const TOO_LONG = `Please keep a message under ${MAX_MESSAGE_LENGTH} characters.`;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type StaffLite = { id: string; name: string; displayName: string | null; role: string; schoolId: string | null; status: string; mayMessageParents: boolean | null };

const staffSelect = { id: true, name: true, displayName: true, role: true, schoolId: true, status: true, mayMessageParents: true } as const;

const greet = (t: { name: string; displayName: string | null }) => t.displayName ?? t.name;

const threadInclude = {
  handler: { select: staffSelect },
  shares: { include: { teacher: { select: staffSelect } } },
} as const;

type ThreadRow = Prisma.MessageThreadGetPayload<{ include: typeof threadInclude }>;

/** The staff who can read a thread right now, honouring "still at this school". */
function readersOf(thread: ThreadRow | null, classTeacher: StaffLite, schoolId: string): StaffReader[] {
  const out: StaffReader[] = [];
  const handler = thread?.handler && thread.handler.schoolId === schoolId ? thread.handler : null;
  if (handler) out.push({ id: handler.id, name: greet(handler), role: "HANDLER" });
  else if (classTeacher.schoolId === schoolId) out.push({ id: classTeacher.id, name: greet(classTeacher), role: "CLASS_TEACHER" });
  for (const s of thread?.shares ?? []) {
    if (s.teacher.schoolId !== schoolId) continue;
    if (out.some((r) => r.id === s.teacher.id)) continue;
    out.push({ id: s.teacher.id, name: greet(s.teacher), role: "SHARED" });
  }
  return out;
}

/** What one member of staff may do on a child's thread. */
type StaffStanding = {
  /** May read and reply. */
  reader: boolean;
  /** May share, unshare and pass: the class teacher (unless passed) or the handler. */
  controls: boolean;
  /** Is the class teacher, whether or not they have passed the family on. */
  isClassTeacher: boolean;
};

function standingOf(teacherId: string, classTeacherId: string, thread: ThreadRow | null): StaffStanding {
  const isClassTeacher = classTeacherId === teacherId;
  const passed = Boolean(thread?.handlerTeacherId);
  const isHandler = thread?.handlerTeacherId === teacherId;
  const shared = Boolean(thread?.shares.some((s) => s.teacherId === teacherId));
  const controls = isHandler || (isClassTeacher && !passed);
  return { reader: controls || shared, controls, isClassTeacher };
}

async function loadChildForParent(parentId: string, studentId: string) {
  return db.student.findFirst({
    where: { id: studentId, parents: { some: { id: parentId } } },
    include: {
      class: { include: { teacher: { select: staffSelect } } },
      messageThread: { include: threadInclude },
    },
  });
}

async function loadChildForStaff(studentId: string) {
  return db.student.findUnique({
    where: { id: studentId },
    include: {
      class: { include: { teacher: { select: staffSelect } } },
      parents: { select: { id: true, name: true } },
      messageThread: { include: threadInclude },
    },
  });
}

async function loadStaff(teacherId: string): Promise<StaffLite | null> {
  return db.teacher.findUnique({ where: { id: teacherId }, select: staffSelect });
}

/**
 * The messages one side may see: all of its own side's, and the other side's
 * only once delivered. Ordered oldest first, the way a conversation reads.
 */
async function visibleMessages(threadId: string, side: "PARENT" | "TEACHER", now: Date) {
  return db.message.findMany({
    where: { threadId, OR: [{ senderType: side }, { deliverAt: { lte: now } }] },
    orderBy: { createdAt: "asc" },
    include: {
      senderParent: { select: { id: true, name: true } },
      senderTeacher: { select: { id: true, name: true, displayName: true } },
    },
  });
}

type SendGate =
  | { ok: true; messaging: SchoolMessaging; policy: Policy }
  | { ok: false; reason: string };

/** Everything about the SCHOOL that decides whether anything can be sent. */
async function schoolSendGate(schoolId: string, classId: string): Promise<SendGate> {
  const messaging = await schoolMessaging(schoolId);
  if (!messaging.onSchoolPlan || !messaging.enabled) return { ok: false, reason: NOT_AVAILABLE };
  if (!hasAnyOpening(messaging.policy)) return { ok: false, reason: NO_HOURS };
  const writable = await requireWritableAccountForClass(classId);
  if (!writable.ok) return { ok: false, reason: PAUSED };
  return { ok: true, messaging, policy: messaging.policy };
}

function hoursSummary(policy: Policy): string {
  const days = policy.windows.slice().sort((a, b) => a.weekday - b.weekday);
  if (days.length === 0) return "";
  // Collapse Monday–Friday with one shared window into one phrase.
  const weekdays = [1, 2, 3, 4, 5].map((d) => days.find((w) => w.weekday === d));
  const same = weekdays.every((w) => w && w.openMinute === weekdays[0]!.openMinute && w.closeMinute === weekdays[0]!.closeMinute);
  if (same && days.length === 5) {
    const w = weekdays[0]!;
    return `School hours for messages are Monday to Friday, ${fmt(w.openMinute)} to ${fmt(w.closeMinute)}.`;
  }
  return "School hours for messages: " + days.map((w) => `${DAY[w.weekday]} ${fmt(w.openMinute)}–${fmt(w.closeMinute)}`).join(", ") + ".";
}
const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function fmt(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""}${h24 < 12 ? "am" : "pm"}`;
}

function toView(
  m: Awaited<ReturnType<typeof visibleMessages>>[number],
  viewer: { side: "PARENT" | "TEACHER"; parentId?: string; teacherId?: string; childName: string; recipientName: string },
  now: Date,
  policy: Policy | null,
): ThreadMessageView {
  const delivered = m.deliverAt.getTime() <= now.getTime();
  const mine = viewer.side === "PARENT" ? m.senderParentId === viewer.parentId : m.senderTeacherId === viewer.teacherId;
  let senderLabel: string;
  if (m.senderType === "PARENT") {
    if (viewer.side === "PARENT") senderLabel = mine ? "You" : m.senderParent?.name || "Another grown-up";
    else senderLabel = m.senderParent?.name || `${viewer.childName}’s grown-up`;
  } else {
    const who = m.senderTeacher ? greet(m.senderTeacher) : "A member of staff";
    senderLabel = viewer.side === "TEACHER" && mine ? `${who} (you)` : who;
  }
  const arrives = !delivered && m.senderType === viewer.side && policy && m.deliverAt.getTime() < HELD_INDEFINITELY.getTime()
    ? describeOpening(m.deliverAt, now, policy.timezone)
    : null;
  return {
    id: m.id,
    from: m.senderType === "PARENT" ? "PARENT" : "TEACHER",
    senderLabel,
    mine,
    messageBody: m.messageBody,
    writtenAtISO: m.createdAt.toISOString(),
    deliverAtISO: m.deliverAt.toISOString(),
    delivered,
    arrives,
  };
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/**
 * A parent's view of the conversation about one of THEIR children. Null when
 * the child is not linked to this parent — never an error that discloses
 * whether the child exists (rule 8).
 */
export async function threadForParent(parentId: string, studentId: string, now: Date = new Date()): Promise<ThreadView | null> {
  const child = await loadChildForParent(parentId, studentId);
  if (!child) return null;
  const classTeacher = child.class.teacher;
  const schoolId = classTeacher.schoolId;
  const thread = child.messageThread;

  // A free teacher's class has no school: the feature is absent, not off.
  if (!schoolId) {
    return {
      studentId, childName: child.name, className: child.class.name, readers: [], recipientName: greet(classTeacher),
      closed: false, messages: [], canSend: false, cannotSendReason: null, openNow: false, nextOpening: null, hoursSummary: "",
    };
  }

  const readers = readersOf(thread, classTeacher, schoolId);
  const recipientName = readers[0]?.name ?? greet(classTeacher);
  const gate = await schoolSendGate(schoolId, child.classId);
  const policy = gate.ok ? gate.policy : null;
  const messages = thread ? await visibleMessages(thread.id, "PARENT", now) : [];
  const views = messages.map((m) => toView(m, { side: "PARENT", parentId, childName: child.name, recipientName }, now, policy));

  const closed = Boolean(thread?.closedAt);
  const openNow = policy ? isOpenAt(now, policy) : false;
  const next = policy && !openNow ? nextOpeningAfter(now, policy) : null;

  // Nothing is "available" to a family whose school has never switched this
  // on: the section is simply not rendered (canSend false, no reason, no
  // messages). The reason is given only when there is something to explain.
  const hadSomething = messages.length > 0;
  let cannotSendReason: string | null = null;
  if (closed) cannotSendReason = CLOSED_THREAD;
  else if (!gate.ok) cannotSendReason = gate.reason === NOT_AVAILABLE && !hadSomething ? null : gate.reason;

  return {
    studentId,
    childName: child.name,
    className: child.class.name,
    readers,
    recipientName,
    closed,
    messages: views,
    canSend: gate.ok && !closed,
    cannotSendReason,
    openNow,
    nextOpening: next && policy ? describeOpening(next, now, policy.timezone) : null,
    hoursSummary: policy ? hoursSummary(policy) : "",
  };
}

export type StaffThreadView = ThreadView & {
  /** The parents on the other side, for the header ("Amara's grown-ups: Dani"). */
  families: string[];
  standing: StaffStanding;
  /** Colleagues this thread could be shared with or passed to. */
  colleagues: Array<{ id: string; name: string }>;
  handlerName: string | null;
};

/**
 * A member of staff's view of a child's conversation, or null when they have
 * no standing on it: not the class teacher (or the class teacher after passing
 * the family on), not the handler, not shared with — or no longer at the
 * school. Null, never a different error, for every one of those (rule 8).
 */
export async function threadForStaff(teacherId: string, studentId: string, now: Date = new Date()): Promise<StaffThreadView | null> {
  const [me, child] = await Promise.all([loadStaff(teacherId), loadChildForStaff(studentId)]);
  if (!me || !child) return null;
  const classTeacher = child.class.teacher;
  const schoolId = classTeacher.schoolId;
  if (!schoolId || me.schoolId !== schoolId) return null;
  const thread = child.messageThread;
  const standing = standingOf(teacherId, classTeacher.id, thread);
  if (!standing.reader) return null;

  const readers = readersOf(thread, classTeacher, schoolId);
  const gate = await schoolSendGate(schoolId, child.classId);
  const policy = gate.ok ? gate.policy : null;
  const messages = thread ? await visibleMessages(thread.id, "TEACHER", now) : [];
  const recipientName = `${child.name}’s family`;
  const views = messages.map((m) => toView(m, { side: "TEACHER", teacherId, childName: child.name, recipientName }, now, policy));

  const closed = Boolean(thread?.closedAt);
  const openNow = policy ? isOpenAt(now, policy) : false;
  const next = policy && !openNow ? nextOpeningAfter(now, policy) : null;
  const permitted = resolveMayMessageParents(me);

  let cannotSendReason: string | null = null;
  if (!permitted) cannotSendReason = NOT_PERMITTED_STAFF;
  else if (closed) cannotSendReason = CLOSED_THREAD;
  else if (!gate.ok) cannotSendReason = gate.reason;

  // Colleagues eligible to be shared with or passed to: same school, active,
  // may message parents, not me, not already reading.
  const colleagues = standing.controls
    ? (await db.teacher.findMany({ where: { schoolId, status: "ACTIVE", NOT: { id: teacherId } }, select: staffSelect, orderBy: { name: "asc" } }))
        .filter((t) => resolveMayMessageParents(t) && !readers.some((r) => r.id === t.id))
        .map((t) => ({ id: t.id, name: greet(t) }))
    : [];

  return {
    studentId,
    childName: child.name,
    className: child.class.name,
    readers,
    recipientName,
    closed,
    messages: views,
    canSend: permitted && gate.ok && !closed,
    cannotSendReason,
    openNow,
    nextOpening: next && policy ? describeOpening(next, now, policy.timezone) : null,
    hoursSummary: policy ? hoursSummary(policy) : "",
    families: child.parents.map((p) => p.name || "A grown-up at home"),
    standing,
    colleagues,
    handlerName: thread?.handler ? greet(thread.handler) : null,
  };
}

export type InboxRow = {
  studentId: string;
  childName: string;
  className: string;
  /** Why it is in this inbox. */
  because: "CLASS_TEACHER" | "HANDLER" | "SHARED";
  lastMessageAtISO: string | null;
  /** Delivered messages from the family not yet read by anyone on staff. */
  unread: number;
  closed: boolean;
};

export type PassedRow = { studentId: string; childName: string; className: string; handlerName: string };

/**
 * A member of staff's inbox: every child in their own classes (so a
 * conversation can be started, not only continued), plus threads they handle
 * or were given. Families a teacher has passed on come back separately, with
 * no content, so the teacher can take them back.
 */
export async function inboxForStaff(teacherId: string, now: Date = new Date()): Promise<{ rows: InboxRow[]; passed: PassedRow[]; available: boolean }> {
  const me = await loadStaff(teacherId);
  if (!me?.schoolId) return { rows: [], passed: [], available: false };
  const schoolId = me.schoolId;
  const messaging = await schoolMessaging(schoolId);

  // THE LAZY HALF of the notification model (rule 6a, src/lib/messaging/notify.ts).
  //
  // Here rather than in `sendStaffMessage`, and that is the whole point: a
  // message written at 21:40 is DELIVERED when the school opens, and an email
  // raised at the moment of writing would put the hold's own leak in a parent's
  // pocket at ten at night. This runs on a staff read, which in the ordinary
  // case is somebody at the school opening StoryJar during the morning the
  // message lands.
  //
  // NOT SCOPED TO THIS SCHOOL, deliberately: it is the same bounded batch the
  // nightly sweep runs, and scoping it would mean a school whose staff never
  // open the inbox is served only by the job while a busy one is served twice.
  // `Message.notifiedAt` makes the overlap harmless.
  //
  // AWAITED RATHER THAN FIRED AND FORGOTTEN. A floating promise in a server
  // component is a promise nothing keeps alive; the cost is one bounded query on
  // a page a teacher opens a few times a day, and `notifyDeliveredMessages`
  // returns early when there is nothing due.
  // The mailer is passed in rather than imported by `notify.ts`, so that the
  // same function is reachable from a job and from a test outside Next. This is
  // the server side of that arrangement and the only place the real sender is
  // supplied.
  await notifyDeliveredMessages(db, sendMail, now);

  const [own, given] = await Promise.all([
    db.student.findMany({
      where: { class: { teacherId } },
      orderBy: [{ class: { createdAt: "asc" } }, { name: "asc" }],
      include: { class: { select: { name: true } }, messageThread: { include: threadInclude } },
    }),
    db.messageThread.findMany({
      where: {
        schoolId,
        OR: [{ handlerTeacherId: teacherId }, { shares: { some: { teacherId } } }],
        NOT: { class: { teacherId } },
      },
      include: { ...threadInclude, student: { select: { id: true, name: true } }, class: { select: { name: true } } },
    }),
  ]);

  const threadIds = [...own.map((s) => s.messageThread?.id), ...given.map((t) => t.id)].filter((x): x is string => Boolean(x));
  const unreadRows = threadIds.length
    ? await db.message.groupBy({
        by: ["threadId"],
        where: { threadId: { in: threadIds }, senderType: "PARENT", deliverAt: { lte: now }, readByTeacherAt: null },
        _count: { _all: true },
      })
    : [];
  const unread = new Map(unreadRows.map((r) => [r.threadId, r._count._all]));

  const rows: InboxRow[] = [];
  const passed: PassedRow[] = [];
  for (const s of own) {
    const t = s.messageThread;
    if (t?.handlerTeacherId && t.handlerTeacherId !== teacherId) {
      passed.push({ studentId: s.id, childName: s.name, className: s.class.name, handlerName: t.handler ? greet(t.handler) : "a colleague" });
      continue;
    }
    rows.push({
      studentId: s.id, childName: s.name, className: s.class.name, because: "CLASS_TEACHER",
      lastMessageAtISO: t?.lastMessageAt?.toISOString() ?? null, unread: t ? unread.get(t.id) ?? 0 : 0, closed: Boolean(t?.closedAt),
    });
  }
  for (const t of given) {
    rows.push({
      studentId: t.student.id, childName: t.student.name, className: t.class.name,
      because: t.handlerTeacherId === teacherId ? "HANDLER" : "SHARED",
      lastMessageAtISO: t.lastMessageAt?.toISOString() ?? null, unread: unread.get(t.id) ?? 0, closed: Boolean(t.closedAt),
    });
  }
  rows.sort((a, b) => {
    if (a.unread !== b.unread) return b.unread - a.unread;
    const at = a.lastMessageAtISO ?? "", bt = b.lastMessageAtISO ?? "";
    if (at !== bt) return bt.localeCompare(at);
    return a.childName.localeCompare(b.childName);
  });
  return { rows, passed, available: messaging.onSchoolPlan && messaging.enabled };
}

/** Delivered messages from families that nobody on staff has read yet. */
export async function staffUnreadCount(teacherId: string, now: Date = new Date()): Promise<number> {
  return db.message.count({
    where: {
      senderType: "PARENT",
      deliverAt: { lte: now },
      readByTeacherAt: null,
      thread: {
        OR: [
          { class: { teacherId }, handlerTeacherId: null },
          { handlerTeacherId: teacherId },
          { shares: { some: { teacherId } } },
        ],
      },
    },
  });
}

/** Delivered messages from staff that this family has not opened yet. */
export async function parentUnreadCount(parentId: string, now: Date = new Date()): Promise<number> {
  return db.message.count({
    where: { senderType: "TEACHER", deliverAt: { lte: now }, readByParentAt: null, thread: { student: { parents: { some: { id: parentId } } } } },
  });
}

/** The same, for one of the family's children. Zero for a child not linked to them. */
export async function parentUnreadFor(parentId: string, studentId: string, now: Date = new Date()): Promise<number> {
  return db.message.count({
    where: { senderType: "TEACHER", deliverAt: { lte: now }, readByParentAt: null, thread: { studentId, student: { parents: { some: { id: parentId } } } } },
  });
}

// ---------------------------------------------------------------------------
// Read marks. A viewer opening the thread marks the OTHER side's delivered
// messages as read. Never shown to the other side (a "read 19:04" would
// manufacture the obligation the hold exists to remove); it drives the badge.
// ---------------------------------------------------------------------------

export async function markReadByParent(parentId: string, studentId: string, now: Date = new Date()): Promise<void> {
  const child = await db.student.findFirst({ where: { id: studentId, parents: { some: { id: parentId } } }, select: { messageThread: { select: { id: true } } } });
  if (!child?.messageThread) return;
  await db.message.updateMany({
    where: { threadId: child.messageThread.id, senderType: "TEACHER", deliverAt: { lte: now }, readByParentAt: null },
    data: { readByParentAt: now },
  });
}

export async function markReadByStaff(teacherId: string, studentId: string, now: Date = new Date()): Promise<void> {
  const view = await threadForStaff(teacherId, studentId, now);
  if (!view) return;
  const thread = await db.messageThread.findUnique({ where: { studentId }, select: { id: true } });
  if (!thread) return;
  await db.message.updateMany({
    where: { threadId: thread.id, senderType: "PARENT", deliverAt: { lte: now }, readByTeacherAt: null },
    data: { readByTeacherAt: now },
  });
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type Sender = { kind: "PARENT"; parentId: string } | { kind: "TEACHER"; teacherId: string };

/**
 * Send a message about a child. Authorises the sender against the child,
 * checks the school can receive anything at all, and computes `deliverAt`
 * from the school's hours. Refuses — rather than parking — when no opening
 * exists within a fortnight (rule 8). Creates the thread on first use.
 */
export async function sendMessage(sender: Sender, studentId: string, rawBody: string, now: Date = new Date()): Promise<SendResult & { studentName?: string; schoolId?: string; classTeacherId?: string }> {
  const messageBody = rawBody.replace(/\r\n/g, "\n").trim();
  if (!messageBody) return { ok: false, error: EMPTY };
  if (messageBody.length > MAX_MESSAGE_LENGTH) return { ok: false, error: TOO_LONG };

  let child: Awaited<ReturnType<typeof loadChildForStaff>> | Awaited<ReturnType<typeof loadChildForParent>>;
  if (sender.kind === "PARENT") {
    child = await loadChildForParent(sender.parentId, studentId);
  } else {
    const me = await loadStaff(sender.teacherId);
    child = await loadChildForStaff(studentId);
    if (!me || !child || !child.class.teacher.schoolId || me.schoolId !== child.class.teacher.schoolId) return { ok: false, error: NOT_AVAILABLE };
    if (!standingOf(sender.teacherId, child.class.teacher.id, child.messageThread).reader) return { ok: false, error: NOT_AVAILABLE };
    if (!resolveMayMessageParents(me)) return { ok: false, error: NOT_PERMITTED_STAFF };
  }
  if (!child) return { ok: false, error: NOT_AVAILABLE };
  const schoolId = child.class.teacher.schoolId;
  if (!schoolId) return { ok: false, error: NOT_AVAILABLE };
  if (child.messageThread?.closedAt) return { ok: false, error: CLOSED_THREAD };

  const gate = await schoolSendGate(schoolId, child.classId);
  if (!gate.ok) return { ok: false, error: gate.reason };

  const deliverAt = deliveryTimeFor(now, gate.policy);
  if (!deliverAt) return { ok: false, error: NO_HOURS };

  await db.$transaction(async (tx) => {
    const thread = await tx.messageThread.upsert({
      where: { studentId },
      create: { studentId, schoolId, classId: child!.classId, lastMessageAt: now },
      update: { lastMessageAt: now },
      select: { id: true },
    });
    await tx.message.create({
      data: {
        threadId: thread.id,
        senderType: sender.kind,
        senderParentId: sender.kind === "PARENT" ? sender.parentId : null,
        senderTeacherId: sender.kind === "TEACHER" ? sender.teacherId : null,
        messageBody,
        createdAt: now,
        deliverAt,
      },
    });
  });

  const held = deliverAt.getTime() > now.getTime();
  return {
    ok: true,
    held,
    arrives: held ? describeOpening(deliverAt, now, gate.policy.timezone) : null,
    studentName: child.name,
    schoolId,
    classTeacherId: child.class.teacher.id,
  };
}

// ---------------------------------------------------------------------------
// Sharing and passing. The caller has a teacher id from a session, never from
// a form; the target comes from a form and is checked against the school.
// ---------------------------------------------------------------------------

type ControlResult = { ok: true; schoolId: string; childName: string; targetName?: string } | { ok: false; error: string };

const NO_STANDING = "You can’t change who sees this conversation.";
const BAD_COLLEAGUE = "Pick a colleague at your school who is set up to message families.";
// Raising a conversation without saying why would be an access with no record
// of why it was needed, which is the one thing that makes the access defensible.
const NEEDS_REASON = "Say briefly why you are raising this. It goes to the safeguarding lead, not to the family.";

/** The thread row, created if the family has never written, for share/pass. */
async function ensureThread(studentId: string, schoolId: string, classId: string, tx: Prisma.TransactionClient) {
  return tx.messageThread.upsert({ where: { studentId }, create: { studentId, schoolId, classId }, update: {}, include: threadInclude });
}

async function eligibleColleague(schoolId: string, teacherId: string, notId: string): Promise<StaffLite | null> {
  if (!teacherId || teacherId === notId) return null;
  const t = await db.teacher.findFirst({ where: { id: teacherId, schoolId, status: "ACTIVE" }, select: staffSelect });
  if (!t || !resolveMayMessageParents(t)) return null;
  return t;
}

export async function shareThread(byTeacherId: string, studentId: string, withTeacherId: string): Promise<ControlResult> {
  const [me, child] = await Promise.all([loadStaff(byTeacherId), loadChildForStaff(studentId)]);
  const schoolId = child?.class.teacher.schoolId ?? null;
  if (!me || !child || !schoolId || me.schoolId !== schoolId) return { ok: false, error: NO_STANDING };
  if (!standingOf(byTeacherId, child.class.teacher.id, child.messageThread).controls) return { ok: false, error: NO_STANDING };
  const target = await eligibleColleague(schoolId, withTeacherId, byTeacherId);
  if (!target) return { ok: false, error: BAD_COLLEAGUE };
  await db.$transaction(async (tx) => {
    const thread = await ensureThread(studentId, schoolId, child.classId, tx);
    // Already a reader by another route: nothing to add.
    if (thread.handlerTeacherId === target.id || child.class.teacher.id === target.id) return;
    await tx.messageThreadShare.upsert({
      where: { threadId_teacherId: { threadId: thread.id, teacherId: target.id } },
      create: { threadId: thread.id, teacherId: target.id, sharedByTeacherId: byTeacherId },
      update: {},
    });
  });
  return { ok: true, schoolId, childName: child.name, targetName: greet(target) };
}

/**
 * A teacher raises one conversation to a member of staff the school has NAMED a
 * safeguarding lead, with a reason (SAFEGUARDING rule 21a).
 *
 * IT IS `shareThread` WITH A NAMED RECIPIENT AND A RECORDED REASON, and keeping
 * it that way is the point. Escalation adds NO NEW ROUTE to a child's data: the
 * lead reads on exactly the terms a colleague shared with does, the reader list
 * the parent can already see gains a name, and nothing else about the thread
 * changes. If per-thread sharing were unsafe, this would be unsafe, and the
 * answer would be to fix sharing rather than to build a second mechanism beside
 * it.
 *
 * THREE DELIBERATE DIFFERENCES FROM `shareThread`, each one a decision:
 *
 *   1. The target must be a NAMED LEAD, resolved through
 *      `resolveIsSafeguardingLead`, which has no role default. A school with no
 *      lead named has nobody to raise to, and is told so rather than being given
 *      a guess.
 *   2. The target does NOT have to hold the school's messaging permission.
 *      Reading a raised conversation and writing to a family are two different
 *      permissions, and the send gate enforces the second one on its own — so a
 *      school whose DSL has messaging switched off can still escalate to them,
 *      and that lead can read and not reply. `eligibleColleague` conflates the
 *      two, correctly, for an ordinary share; here it would be wrong.
 *   3. The REASON is stored, on the share row and nowhere else. It is free text
 *      an adult writes about a child, which is exactly why it must not reach
 *      `AuditLog.detail` — the `handoverReason` precedent, and the same argument
 *      that keeps message bodies out of the log: a second copy on a different
 *      retention clock is a copy nobody asked for.
 *
 * THE PARENT IS NOT TOLD, and the reader list is the transparency. Rule 21
 * already shows a parent which staff can read their conversation; that list is
 * what changes. A notice saying "this has been raised" would tell a parent that
 * a concern exists about their household, which is a decision for the school's
 * own safeguarding procedure and never for a piece of software.
 */
export async function raiseThreadWithLead(
  byTeacherId: string,
  studentId: string,
  leadTeacherId: string,
  reason: string,
  now: Date = new Date(),
): Promise<ControlResult> {
  const [me, child] = await Promise.all([loadStaff(byTeacherId), loadChildForStaff(studentId)]);
  const schoolId = child?.class.teacher.schoolId ?? null;
  if (!me || !child || !schoolId || me.schoolId !== schoolId) return { ok: false, error: NO_STANDING };
  // Only somebody who CONTROLS the thread may raise it: the class teacher, or
  // the colleague they passed the family to. A reader who was shared with
  // cannot pass it on again, exactly as they cannot share it on today.
  if (!standingOf(byTeacherId, child.class.teacher.id, child.messageThread).controls) return { ok: false, error: NO_STANDING };
  if (!leadTeacherId || leadTeacherId === byTeacherId) return { ok: false, error: BAD_COLLEAGUE };

  const lead = await db.teacher.findFirst({
    where: { id: leadTeacherId, schoolId, status: "ACTIVE" },
    select: { ...staffSelect, isSafeguardingLead: true },
  });
  // A member of staff who is not a NAMED lead is refused with the same generic
  // message as one who is not at this school at all: the refusal must not tell
  // the asker which of the two it was (rule 8).
  if (!lead || !resolveIsSafeguardingLead(lead)) return { ok: false, error: BAD_COLLEAGUE };

  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: NEEDS_REASON };

  await db.$transaction(async (tx) => {
    const thread = await ensureThread(studentId, schoolId, child.classId, tx);
    // Written in ONE transaction with the share, so a raise whose reason cannot
    // be recorded does not happen — the shape `OpsAuditLog` uses for an adult
    // lookup, and for the same reason: the record is what makes the access
    // accountable, so the access must not outlive it.
    await tx.messageThreadShare.upsert({
      where: { threadId_teacherId: { threadId: thread.id, teacherId: lead.id } },
      create: {
        threadId: thread.id,
        teacherId: lead.id,
        sharedByTeacherId: byTeacherId,
        raisedReason: trimmed.slice(0, 500),
        raisedAt: now,
      },
      // A lead who was already an ordinary reader becomes a RAISED one, and the
      // newer reason stands: raising again after something has changed is the
      // ordinary case, not an error.
      update: { raisedReason: trimmed.slice(0, 500), raisedAt: now, sharedByTeacherId: byTeacherId },
    });
  });

  return { ok: true, schoolId, childName: child.name, targetName: greet(lead) };
}

export async function unshareThread(byTeacherId: string, studentId: string, teacherId: string): Promise<ControlResult> {
  const [me, child] = await Promise.all([loadStaff(byTeacherId), loadChildForStaff(studentId)]);
  const schoolId = child?.class.teacher.schoolId ?? null;
  if (!me || !child || !schoolId || me.schoolId !== schoolId || !child.messageThread) return { ok: false, error: NO_STANDING };
  // The person a thread was shared with may drop it themselves; otherwise
  // it takes the class teacher or the handler.
  const standing = standingOf(byTeacherId, child.class.teacher.id, child.messageThread);
  if (!standing.controls && byTeacherId !== teacherId) return { ok: false, error: NO_STANDING };
  const { count } = await db.messageThreadShare.deleteMany({ where: { threadId: child.messageThread.id, teacherId } });
  if (count === 0) return { ok: false, error: NO_STANDING };
  const target = await db.teacher.findUnique({ where: { id: teacherId }, select: { name: true, displayName: true } });
  return { ok: true, schoolId, childName: child.name, targetName: target ? greet(target) : undefined };
}

/**
 * A teacher opts out of one family by handing the thread to a colleague, who
 * then has everything the teacher had on it. The parent is not told. The
 * reason, if given, is for the school admin and lives on the thread row.
 */
export async function passThread(byTeacherId: string, studentId: string, toTeacherId: string, reason: string, now: Date = new Date()): Promise<ControlResult> {
  const [me, child] = await Promise.all([loadStaff(byTeacherId), loadChildForStaff(studentId)]);
  const schoolId = child?.class.teacher.schoolId ?? null;
  if (!me || !child || !schoolId || me.schoolId !== schoolId) return { ok: false, error: NO_STANDING };
  if (!standingOf(byTeacherId, child.class.teacher.id, child.messageThread).controls) return { ok: false, error: NO_STANDING };
  const target = await eligibleColleague(schoolId, toTeacherId, byTeacherId);
  if (!target) return { ok: false, error: BAD_COLLEAGUE };
  await db.$transaction(async (tx) => {
    const thread = await ensureThread(studentId, schoolId, child.classId, tx);
    await tx.messageThread.update({
      where: { id: thread.id },
      data: { handlerTeacherId: target.id, passedAt: now, handoverReason: reason.trim().slice(0, 300) || null },
    });
    // The handler holds the thread outright; a share row for them is redundant.
    await tx.messageThreadShare.deleteMany({ where: { threadId: thread.id, teacherId: target.id } });
  });
  return { ok: true, schoolId, childName: child.name, targetName: greet(target) };
}

/** The class teacher takes a family back from whoever holds it. */
export async function takeBackThread(byTeacherId: string, studentId: string): Promise<ControlResult> {
  const [me, child] = await Promise.all([loadStaff(byTeacherId), loadChildForStaff(studentId)]);
  const schoolId = child?.class.teacher.schoolId ?? null;
  if (!me || !child || !schoolId || me.schoolId !== schoolId || !child.messageThread) return { ok: false, error: NO_STANDING };
  if (child.class.teacher.id !== byTeacherId || !child.messageThread.handlerTeacherId) return { ok: false, error: NO_STANDING };
  const previous = child.messageThread.handler;
  await db.messageThread.update({ where: { id: child.messageThread.id }, data: { handlerTeacherId: null, passedAt: null, handoverReason: null } });
  return { ok: true, schoolId, childName: child.name, targetName: previous ? greet(previous) : undefined };
}

// ---------------------------------------------------------------------------
// Oversight: what a school ADMIN may see and do (SAFEGUARDING rules 5 and 21).
//
// The school governs the channel, not the conversation. Everything here is
// metadata — a child's first name and class, who reads the thread, how many
// messages are waiting and for how long — and never a body. An admin can
// close a thread, give it to a member of staff or change who holds it, all
// without seeing a word of it. Scoped by the admin's own school.
// ---------------------------------------------------------------------------

export type OversightRow = {
  studentId: string;
  childName: string;
  className: string;
  classTeacherName: string;
  handlerName: string | null;
  handlerTeacherId: string | null;
  sharedWith: Array<{ id: string; name: string }>;
  messages: number;
  /** Delivered messages from the family that nobody on staff has read. */
  waiting: number;
  oldestWaitingISO: string | null;
  lastMessageAtISO: string | null;
  closed: boolean;
};

export async function oversightForSchool(schoolId: string, now: Date = new Date()): Promise<OversightRow[]> {
  const threads = await db.messageThread.findMany({
    where: { schoolId },
    orderBy: [{ lastMessageAt: "desc" }],
    include: {
      student: { select: { id: true, name: true } },
      class: { select: { name: true, teacher: { select: { name: true, displayName: true } } } },
      handler: { select: { id: true, name: true, displayName: true } },
      shares: { include: { teacher: { select: { id: true, name: true, displayName: true, schoolId: true } } } },
      // Metadata only: no messageBody in this select, by construction.
      messages: { select: { senderType: true, deliverAt: true, readByTeacherAt: true, createdAt: true } },
    },
  });
  return threads.map((t) => {
    const waiting = t.messages.filter((m) => m.senderType === "PARENT" && m.deliverAt.getTime() <= now.getTime() && !m.readByTeacherAt);
    const oldest = waiting.reduce<Date | null>((acc, m) => (acc && acc < m.createdAt ? acc : m.createdAt), null);
    return {
      studentId: t.student.id,
      childName: t.student.name,
      className: t.class.name,
      classTeacherName: greet(t.class.teacher),
      handlerName: t.handler ? greet(t.handler) : null,
      handlerTeacherId: t.handlerTeacherId,
      sharedWith: t.shares.filter((s) => s.teacher.schoolId === schoolId).map((s) => ({ id: s.teacher.id, name: greet(s.teacher) })),
      messages: t.messages.length,
      waiting: waiting.length,
      oldestWaitingISO: oldest ? oldest.toISOString() : null,
      lastMessageAtISO: t.lastMessageAt ? t.lastMessageAt.toISOString() : null,
      closed: Boolean(t.closedAt),
    };
  });
}

type AdminResult = { ok: true; childName: string; targetName?: string } | { ok: false };

async function threadInSchool(schoolId: string, studentId: string) {
  return db.messageThread.findFirst({ where: { studentId, schoolId }, include: { student: { select: { name: true, classId: true } } } });
}

/** Close (or reopen) a conversation. Deletes nothing, reveals nothing. */
export async function setThreadClosed(schoolId: string, studentId: string, byTeacherId: string, closed: boolean, now: Date = new Date()): Promise<AdminResult> {
  // A family that has never written has no row yet; closing still has to
  // stick, so the row is created closed.
  const student = await db.student.findFirst({ where: { id: studentId, class: { teacher: { schoolId } } }, select: { id: true, name: true, classId: true } });
  if (!student) return { ok: false };
  await db.messageThread.upsert({
    where: { studentId },
    create: { studentId, schoolId, classId: student.classId, closedAt: closed ? now : null, closedByTeacherId: closed ? byTeacherId : null },
    update: { closedAt: closed ? now : null, closedByTeacherId: closed ? byTeacherId : null },
  });
  return { ok: true, childName: student.name };
}

/** An admin gives a thread to a member of staff, without reading it. */
export async function adminShareThread(schoolId: string, studentId: string, teacherId: string): Promise<AdminResult> {
  const student = await db.student.findFirst({ where: { id: studentId, class: { teacher: { schoolId } } }, select: { id: true, name: true, classId: true, class: { select: { teacherId: true } } } });
  if (!student) return { ok: false };
  const target = await eligibleColleague(schoolId, teacherId, "");
  if (!target || target.id === student.class.teacherId) return { ok: false };
  await db.$transaction(async (tx) => {
    const thread = await ensureThread(studentId, schoolId, student.classId, tx);
    if (thread.handlerTeacherId === target.id) return;
    await tx.messageThreadShare.upsert({
      where: { threadId_teacherId: { threadId: thread.id, teacherId: target.id } },
      create: { threadId: thread.id, teacherId: target.id },
      update: {},
    });
  });
  return { ok: true, childName: student.name, targetName: greet(target) };
}

export async function adminUnshareThread(schoolId: string, studentId: string, teacherId: string): Promise<AdminResult> {
  const thread = await threadInSchool(schoolId, studentId);
  if (!thread) return { ok: false };
  const { count } = await db.messageThreadShare.deleteMany({ where: { threadId: thread.id, teacherId } });
  if (count === 0) return { ok: false };
  const target = await db.teacher.findUnique({ where: { id: teacherId }, select: { name: true, displayName: true } });
  return { ok: true, childName: thread.student.name, targetName: target ? greet(target) : undefined };
}

/**
 * An admin changes who holds a thread: to a member of staff, or back to the
 * class teacher (null). The reason field is left alone — it is the teacher's.
 */
export async function adminSetHandler(schoolId: string, studentId: string, teacherId: string | null, now: Date = new Date()): Promise<AdminResult> {
  const student = await db.student.findFirst({ where: { id: studentId, class: { teacher: { schoolId } } }, select: { id: true, name: true, classId: true, class: { select: { teacherId: true } } } });
  if (!student) return { ok: false };
  let target: StaffLite | null = null;
  if (teacherId) {
    target = await eligibleColleague(schoolId, teacherId, "");
    if (!target || target.id === student.class.teacherId) return { ok: false };
  }
  await db.$transaction(async (tx) => {
    const thread = await ensureThread(studentId, schoolId, student.classId, tx);
    await tx.messageThread.update({
      where: { id: thread.id },
      data: target ? { handlerTeacherId: target.id, passedAt: now } : { handlerTeacherId: null, passedAt: null, handoverReason: null },
    });
    if (target) await tx.messageThreadShare.deleteMany({ where: { threadId: thread.id, teacherId: target.id } });
  });
  return { ok: true, childName: student.name, targetName: target ? greet(target) : undefined };
}

// ---------------------------------------------------------------------------
// The policy-change recompute (called from policy.ts inside its transaction)
// ---------------------------------------------------------------------------

/**
 * The hard rule, applied to every message in a school that has not yet been
 * delivered, inside the transaction that changed the school's policy. A school
 * that narrows its hours after a message was held would otherwise deliver it
 * outside the new window; a school that widens them would otherwise keep a
 * parent waiting for an opening that has already happened.
 *
 * Recomputed from `createdAt`, never from the old `deliverAt`, so the answer
 * is the one the new policy gives to the moment the message was written.
 * `policy` null means messaging is off or has no opening: everything waiting is
 * parked at HELD_INDEFINITELY until the policy changes again.
 */
export async function recomputeHeldDeliveries(
  tx: Prisma.TransactionClient,
  schoolId: string,
  policy: Policy | null,
  now: Date = new Date(),
): Promise<number> {
  const waiting = await tx.message.findMany({
    where: { deliverAt: { gt: now }, thread: { schoolId } },
    select: { id: true, createdAt: true },
  });
  if (waiting.length === 0) return 0;
  const usable = policy && hasAnyOpening(policy) ? policy : null;
  for (const m of waiting) {
    const when = usable ? deliveryTimeFor(m.createdAt, usable) : null;
    await tx.message.update({ where: { id: m.id }, data: { deliverAt: when ?? HELD_INDEFINITELY } });
  }
  return waiting.length;
}

// ===========================================================================
// The conversation, for a subject access request.
// ===========================================================================

export type ThreadExport = {
  /** Wording for the export's `notIncluded` list when the answer is null. */
  withheldBecause?: string;
  messages: Array<{
    from: "A grown-up at home" | "The school";
    /** The member of staff who wrote it, for a school message. Families see this name in the product already. */
    staffName: string | null;
    text: string;
    writtenAt: string;
    /** When it reached the other side. Held messages carry a future date, and that is disclosed rather than hidden. */
    deliveredAt: string | null;
  }>;
  readers: string[];
};

/**
 * A child's message thread, for the per-pupil subject access export.
 *
 * WHY IT IS DISCLOSED AT ALL. A subject access request asks what the school
 * HOLDS, and since 7 September that includes a conversation between the child's
 * guardians and their teacher, about the child. `SAFEGUARDING.md` rule 3's scope
 * note settled the same question for work still in the approval queue —
 * "approval determines visibility inside StoryJar and never limits disclosure to
 * a data subject or their representative" — and a workflow state does not narrow
 * Article 15 here either. An export that omitted the thread would answer "what
 * have you shown us" to a question that asked "what do you hold".
 *
 * IT DOES NOT WIDEN RULE 21 BY ONE PERSON. The reader is resolved exactly as the
 * product resolves it: this member of staff must be the class teacher, the
 * handler, or somebody the thread was shared with, still at the school and still
 * permitted to message families. If they are not, this returns the thread as
 * WITHHELD rather than as absent — the export names it so the school can supply
 * it, which is the same treatment media bytes and drafts already get. A file
 * that quietly omits a conversation is a worse answer to a SAR than one that
 * says a conversation exists and who to ask for it.
 *
 * EVERY MESSAGE, INCLUDING ONE STILL WAITING FOR OFFICE HOURS. The hold governs
 * DELIVERY, not what is held: a message written at nine at night is on the
 * school's disk from the moment it is written, so it is disclosed, with the time
 * it will arrive. This is the one place that deliberately does not apply
 * `visibleMessages`' delivery filter, and the reason is the same one that put
 * PENDING work in the export.
 *
 * WHAT IS NOT HERE: `handoverReason`, which is the admin's alone and never
 * reaches a parent or an audit row; `raisedReason`, a teacher's words to the
 * school's safeguarding lead about why they raised the conversation (rule 21a),
 * which is the school's internal safeguarding record and is disclosed, if at
 * all, by the school applying its own process and the exemptions that go with
 * it, never by a file a teacher presses a button to make; and nothing about any
 * other child, because a thread is per-child by construction.
 */
export async function threadForExport(teacherId: string, studentId: string): Promise<ThreadExport | null> {
  const [me, child] = await Promise.all([loadStaff(teacherId), loadChildForStaff(studentId)]);
  if (!me || !child) return null;
  const thread = child.messageThread;
  if (!thread) return null; // Nothing was ever said. Nothing to disclose or to name.

  const classTeacher = child.class.teacher;
  const schoolId = classTeacher.schoolId;
  if (!schoolId || me.schoolId !== schoolId) return null;

  const standing = standingOf(teacherId, classTeacher.id, thread);
  if (!standing.reader || !resolveMayMessageParents(me)) {
    return {
      withheldBecause:
        "A message thread between this child’s family and the school is held, and is not in this file because " +
        "the member of staff who produced it is not one of the people who may read it. Ask the school office for it.",
      messages: [],
      readers: [],
    };
  }

  const rows = await db.message.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
    include: { senderTeacher: { select: staffSelect } },
  });

  return {
    messages: rows.map((m) => ({
      from: m.senderType === "PARENT" ? ("A grown-up at home" as const) : ("The school" as const),
      staffName: m.senderTeacher ? greet(m.senderTeacher) : null,
      text: m.messageBody,
      writtenAt: m.createdAt.toISOString(),
      // A message still waiting for the school to open carries a future date,
      // and `HELD_INDEFINITELY` means the school has no hours it could arrive
      // in. Both are said plainly rather than shown as delivered.
      deliveredAt: m.deliverAt.getTime() === HELD_INDEFINITELY.getTime() ? null : m.deliverAt.toISOString(),
    })),
    readers: readersOf(thread, classTeacher, schoolId).map((r) => r.name),
  };
}
