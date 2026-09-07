// The office-hours rules for parent–teacher messages, as pure functions.
//
// SAFEGUARDING.md rule 21: a message is never delivered outside the school's
// office hours, in either direction. This module is the whole of that rule in
// code. It has no "server-only" import on purpose: the admin form and the
// server action both read the same caps and the same validation from here, so
// what the form allows and what the action accepts cannot drift apart. The
// action is still the enforcement point — a form is a convenience.
//
// THE CAPS ARE STORYJAR'S, NOT THE SCHOOL'S. A school chooses its own window
// inside them (07:00–17:00, 08:00–18:00, or anything shorter) and may not go
// outside them. The three constants below are the only place the limits live.
//
// TIME ZONE. Every school StoryJar serves is in the UK, and the server is in
// Amsterdam, so a wall-clock rule evaluated in the host's zone would be wrong
// for an hour of every summer evening. Everything here is evaluated in the
// policy's IANA zone (Europe/London in practice) through Intl, which handles
// British Summer Time without a date library. The same pattern as
// src/lib/ops/health.ts, deliberately copied rather than imported: that file
// sits under the operator roots and the blindness gate's import allowlist is
// not the right thing for product code to lean on.
//
// The two clock changes (late March, late October) fall between 01:00 and
// 02:00. The earliest a window may open is 06:00, so no valid window ever
// straddles a clock change; a message WRITTEN at 01:30 on either night is
// handled like any other out-of-hours message and lands at the next opening.

export const EARLIEST_OPEN_MINUTE = 6 * 60; // 06:00
export const LATEST_CLOSE_MINUTE = 20 * 60; // 20:00
export const MAX_WINDOW_MINUTES = 10 * 60; // ten hours

export const DEFAULT_TIMEZONE = "Europe/London";

/** How far ahead nextOpeningAfter will look before giving up. */
export const MAX_LOOKAHEAD_DAYS = 14;

// 0 = Sunday … 6 = Saturday, matching Date#getDay so nothing has to translate.
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DayWindow = {
  weekday: number;
  /** Minutes after midnight, local to the policy's zone. */
  openMinute: number;
  closeMinute: number;
};

export type Policy = {
  windows: DayWindow[];
  /** Closed dates as "YYYY-MM-DD" in the policy's zone: INSET days, holidays. */
  closures: string[];
  timezone: string;
};

export type WindowError = "BAD_WEEKDAY" | "TOO_EARLY" | "TOO_LATE" | "BACKWARDS" | "TOO_LONG";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Null when the window is inside StoryJar's caps; otherwise which cap it broke. */
export function validateWindow(w: DayWindow): WindowError | null {
  if (!Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6) return "BAD_WEEKDAY";
  if (!Number.isInteger(w.openMinute) || !Number.isInteger(w.closeMinute)) return "BACKWARDS";
  if (w.openMinute < EARLIEST_OPEN_MINUTE) return "TOO_EARLY";
  if (w.closeMinute > LATEST_CLOSE_MINUTE) return "TOO_LATE";
  if (w.closeMinute <= w.openMinute) return "BACKWARDS";
  if (w.closeMinute - w.openMinute > MAX_WINDOW_MINUTES) return "TOO_LONG";
  return null;
}

/** Plain-English reason for the admin form. No jargon (error-string audit). */
export function windowErrorMessage(err: WindowError): string {
  switch (err) {
    case "BAD_WEEKDAY":
      return "That is not a day of the week.";
    case "TOO_EARLY":
      return `Office hours cannot open before ${formatMinute(EARLIEST_OPEN_MINUTE)}.`;
    case "TOO_LATE":
      return `Office hours cannot close after ${formatMinute(LATEST_CLOSE_MINUTE)}.`;
    case "BACKWARDS":
      return "Closing time needs to be after opening time.";
    case "TOO_LONG":
      return `Office hours can be at most ${MAX_WINDOW_MINUTES / 60} hours a day.`;
  }
}

/** "YYYY-MM-DD", and a real calendar date. */
export function isClosureDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Minutes after midnight from "HH:MM"; null for anything else. */
export function parseMinute(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "8:00am", "4:30pm" — the form a parent reads without thinking. */
export function formatMinute(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "HH:MM" for a <input type="time"> value. */
export function toTimeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Wall-clock in the policy's zone
// ---------------------------------------------------------------------------

export type LocalParts = {
  year: number;
  month: number; // 1–12
  day: number;
  weekday: number; // 0 = Sunday
  minute: number; // minutes after local midnight
  date: string; // "YYYY-MM-DD"
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timezone, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall-clock reading of an instant in the policy's zone. */
export function localParts(instant: Date, timezone: string = DEFAULT_TIMEZONE): LocalParts {
  const parts = formatterFor(timezone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  // Intl reports 24 for midnight under some hourCycle settings in older engines;
  // fold it so 00:00 is minute 0 rather than minute 1440.
  const hour = Number(get("hour")) % 24;
  const minute = hour * 60 + Number(get("minute"));
  const weekday = WEEKDAY_INDEX[get("weekday").slice(0, 3)] ?? new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday, minute, date: `${year}-${pad(month)}-${pad(day)}` };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// The zone's offset from UTC at a given instant, in minutes, derived from the
// wall-clock reading rather than looked up in a table.
function offsetMinutesAt(instant: Date, timezone: string): number {
  const p = localParts(instant, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, 0, p.minute);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * The instant at which a local wall-clock time occurs. Two passes, so the
 * offset used is the one in force at the answer rather than at the guess: the
 * standard way to land on the right side of a clock change without a library.
 * Local times that do not exist (the skipped hour in March) resolve to the
 * instant after the gap; the caps above keep every window clear of that hour.
 */
export function localToInstant(year: number, month: number, day: number, minute: number, timezone: string = DEFAULT_TIMEZONE): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minute);
  const first = guess - offsetMinutesAt(new Date(guess), timezone) * 60000;
  const second = guess - offsetMinutesAt(new Date(first), timezone) * 60000;
  return new Date(second);
}

/** The calendar date `days` after a local date, as (year, month, day). */
function addDays(year: number, month: number, day: number, days: number): [number, number, number] {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

// ---------------------------------------------------------------------------
// The rule
// ---------------------------------------------------------------------------

function windowFor(policy: Policy, weekday: number): DayWindow | null {
  return policy.windows.find((w) => w.weekday === weekday && validateWindow(w) === null) ?? null;
}

function isClosed(policy: Policy, date: string): boolean {
  return policy.closures.includes(date);
}

/** True when the school's office hours are open at this instant. */
export function isOpenAt(instant: Date, policy: Policy): boolean {
  const p = localParts(instant, policy.timezone);
  if (isClosed(policy, p.date)) return false;
  const w = windowFor(policy, p.weekday);
  if (!w) return false;
  return p.minute >= w.openMinute && p.minute < w.closeMinute;
}

/**
 * The next instant at which office hours open, at or after `instant`. Returns
 * `instant` itself when already open. Returns null when nothing opens within
 * MAX_LOOKAHEAD_DAYS — a school that has closed every weekday, or a long
 * closure — so a caller can refuse to accept a message that could never
 * arrive rather than store one in limbo (SAFEGUARDING.md rule 8: deny by
 * default).
 */
export function nextOpeningAfter(instant: Date, policy: Policy): Date | null {
  if (isOpenAt(instant, policy)) return instant;
  const start = localParts(instant, policy.timezone);
  for (let i = 0; i <= MAX_LOOKAHEAD_DAYS; i++) {
    const [y, m, d] = addDays(start.year, start.month, start.day, i);
    const date = `${y}-${pad(m)}-${pad(d)}`;
    if (isClosed(policy, date)) continue;
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const w = windowFor(policy, weekday);
    if (!w) continue;
    // Today: only a window that has not yet opened counts; one that has
    // already closed belongs to the loop's next iteration.
    if (i === 0 && start.minute >= w.openMinute) continue;
    return localToInstant(y, m, d, w.openMinute, policy.timezone);
  }
  return null;
}

/**
 * When a message written at `writtenAt` is delivered: immediately if the
 * school is open, otherwise at the next opening. Null means "never within a
 * fortnight" and the send must be refused.
 */
export function deliveryTimeFor(writtenAt: Date, policy: Policy): Date | null {
  return nextOpeningAfter(writtenAt, policy);
}

/** A policy with no usable window at all: nothing can ever be delivered. */
export function hasAnyOpening(policy: Policy): boolean {
  return policy.windows.some((w) => validateWindow(w) === null);
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/**
 * "at 8:00am today" / "at 8:00am tomorrow" / "at 8:00am on Monday" /
 * "at 8:00am on Monday 12 October" — for the sentence a sender reads the moment
 * they press send. Names the actual opening rather than a duration, because
 * "in 62 hours" is a sum and "on Monday morning" is an answer.
 */
export function describeOpening(opening: Date, now: Date, timezone: string = DEFAULT_TIMEZONE): string {
  const o = localParts(opening, timezone);
  const n = localParts(now, timezone);
  const time = formatMinute(o.minute);
  const dayDiff = Math.round((Date.UTC(o.year, o.month - 1, o.day) - Date.UTC(n.year, n.month - 1, n.day)) / 86400000);
  if (dayDiff <= 0) return `at ${time} today`;
  if (dayDiff === 1) return `at ${time} tomorrow`;
  if (dayDiff < 7) return `at ${time} on ${WEEKDAY_NAMES[o.weekday]}`;
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, month: "long" }).format(opening);
  return `at ${time} on ${WEEKDAY_NAMES[o.weekday]} ${o.day} ${month}`;
}

/** "Monday to Friday, 8:00am to 4:00pm" style summary for a policy. */
export function describePolicy(policy: Policy): string {
  const days = policy.windows
    .filter((w) => validateWindow(w) === null)
    .sort((a, b) => a.weekday - b.weekday);
  if (days.length === 0) return "No office hours set yet.";
  return days.map((w) => `${WEEKDAY_NAMES[w.weekday]} ${formatMinute(w.openMinute)}–${formatMinute(w.closeMinute)}`).join(", ");
}
