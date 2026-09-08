import { formatMinute, localToInstant, parseMinute, isClosureDate, WEEKDAY_NAMES, localParts, DEFAULT_TIMEZONE } from "@/lib/messaging/officeHours";

// ===========================================================================
// Parents' evening: the shape of an evening, and nothing that touches a person.
//
// NO `server-only`, deliberately, and the same reason `officeHours.ts` and
// `consent.ts` have none: the screen that draws the grid and the action that
// creates the rows must agree about what "6:00pm to 8:00pm in ten-minute slots"
// means. The action is still the enforcement point; the screen is a convenience.
//
// ---------------------------------------------------------------------------
// WHY OFFICE HOURS DO NOT CAP THIS, and why that is not an inconsistency.
// ---------------------------------------------------------------------------
//
// SAFEGUARDING rule 21's hold exists so a teacher's EVENING IS NOT A WORKPLACE:
// a message written at nine at night must not arrive at nine at night, and there
// is no override. A parents' evening is the one occasion a school deliberately
// asks its staff to be there after hours — agreed in advance, in the diary, and
// the entire point of the exercise. Applying the messaging caps to it would
// refuse the feature rather than govern it.
//
// What is reused is the TIME MACHINERY, and it must be. Every instant here comes
// from `localToInstant` and every label from `formatMinute` / `localParts`.
// `toLocaleDateString` is never used for a time: a 4:20pm slot formatted that
// way is a BST bug the day the server is not in London, and it is the exact
// server/client hydration failure `officeHours.ts` documents at length.
//
// The bounds below are StoryJar's own and are about the same thing rule 21 is
// about — 7am to 9pm, and no more than sixty appointments for one teacher on one
// evening, which is ten hours of ten-minute slots back to back. A school that
// wants more than that is describing two evenings.
// ===========================================================================

export const MEETING_EARLIEST_MINUTE = 7 * 60; // 07:00
export const MEETING_LATEST_MINUTE = 21 * 60; // 21:00
export const MIN_SLOT_MINUTES = 5;
export const MAX_SLOT_MINUTES = 60;
export const MAX_SLOTS_PER_TEACHER = 60;

export type EveningError =
  | "BAD_DATE"
  | "BAD_TIME"
  | "TOO_EARLY"
  | "TOO_LATE"
  | "BACKWARDS"
  | "BAD_LENGTH"
  | "NO_SLOTS"
  | "TOO_MANY";

/** Plain-English reason for the admin form. No jargon (error-string audit). */
export function eveningErrorMessage(err: EveningError): string {
  switch (err) {
    case "BAD_DATE":
      return "That date doesn't look like a date. Pick the evening from the calendar.";
    case "BAD_TIME":
      return "Those times don't look like times. Use the clock fields.";
    case "TOO_EARLY":
      return "Appointments can't start before 7 in the morning.";
    case "TOO_LATE":
      return "Appointments can't run past 9 at night.";
    case "BACKWARDS":
      return "The finish has to be after the start.";
    case "BAD_LENGTH":
      return "An appointment can be between 5 minutes and an hour long.";
    case "NO_SLOTS":
      return "That doesn't leave room for a single appointment — make the window longer or the slots shorter.";
    case "TOO_MANY":
      return `That is more than ${MAX_SLOTS_PER_TEACHER} appointments for one teacher in one evening. Split it across two evenings.`;
  }
}

export type EveningShape = {
  /** "YYYY-MM-DD" in the school's own zone. */
  eventDate: string;
  /** Minutes after midnight, local. */
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
};

/**
 * Null when the evening is inside StoryJar's bounds; otherwise which bound it
 * broke. Checked here rather than in the action so the form can say the same
 * thing before the press that the server says after it.
 */
export function validateEvening(shape: EveningShape): EveningError | null {
  if (!isClosureDate(shape.eventDate)) return "BAD_DATE"; // same "YYYY-MM-DD is a real calendar date" test
  if (!Number.isInteger(shape.startMinute) || !Number.isInteger(shape.endMinute)) return "BAD_TIME";
  if (shape.startMinute < MEETING_EARLIEST_MINUTE) return "TOO_EARLY";
  if (shape.endMinute > MEETING_LATEST_MINUTE) return "TOO_LATE";
  if (shape.endMinute <= shape.startMinute) return "BACKWARDS";
  if (shape.slotMinutes < MIN_SLOT_MINUTES || shape.slotMinutes > MAX_SLOT_MINUTES) return "BAD_LENGTH";
  const count = slotMinutesFor(shape).length;
  if (count === 0) return "NO_SLOTS";
  if (count > MAX_SLOTS_PER_TEACHER) return "TOO_MANY";
  return null;
}

/**
 * The start of every appointment in the evening, as minutes after midnight.
 *
 * A part-slot at the end is dropped rather than shortened: an appointment that
 * is four minutes long because the arithmetic ran out is a mistake a school
 * would only find on the night.
 */
export function slotMinutesFor(shape: EveningShape): number[] {
  const out: number[] = [];
  if (shape.slotMinutes <= 0) return out;
  for (let m = shape.startMinute; m + shape.slotMinutes <= shape.endMinute; m += shape.slotMinutes) {
    out.push(m);
    if (out.length > MAX_SLOTS_PER_TEACHER + 1) break; // bounded; validateEvening reports it
  }
  return out;
}

/** "YYYY-MM-DD" + minutes-after-midnight → the instant, in the school's zone. */
export function slotInstant(eventDate: string, minute: number, timezone: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = eventDate.split("-").map(Number);
  return localToInstant(y, m, d, minute, timezone);
}

/** "6:20pm" — the label a parent taps. Never `toLocaleDateString`. */
export function slotLabel(instant: Date, timezone: string = DEFAULT_TIMEZONE): string {
  return formatMinute(localParts(instant, timezone).minute);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * "Wednesday 14 October" for a "YYYY-MM-DD" evening.
 *
 * Composed by hand from the date's own digits, not by `Intl`, for the reason
 * `formatLondonStamp` gives: Node's ICU and Chrome's ICU disagree about how
 * en-GB punctuates a date, and a component rendered on the server and hydrated
 * in the browser then fails to hydrate over a comma.
 */
export function eveningLabel(eventDate: string): string {
  if (!isClosureDate(eventDate)) return eventDate;
  const [y, m, d] = eventDate.split("-").map(Number);
  // Midday, so the weekday is the same whichever side of a clock change it is.
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${WEEKDAY_NAMES[weekday]} ${d} ${MONTH_NAMES[m - 1]}`;
}

/** Minutes-after-midnight from an "HH:MM" form field; null for anything else. */
export const parseClock = parseMinute;

/** True when the school has told StoryJar it is shut that day. */
export function isSchoolClosedOn(eventDate: string, closures: string[]): boolean {
  return closures.includes(eventDate);
}
