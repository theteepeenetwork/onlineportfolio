import { test, expect } from "@playwright/test";
import {
  EARLIEST_OPEN_MINUTE,
  LATEST_CLOSE_MINUTE,
  MAX_WINDOW_MINUTES,
  deliveryTimeFor,
  describeOpening,
  formatMinute,
  hasAnyOpening,
  isClosureDate,
  isOpenAt,
  localToInstant,
  nextOpeningAfter,
  parseMinute,
  validateWindow,
  type Policy,
} from "@/lib/messaging/officeHours";

// ===========================================================================
// SAFEGUARDING.md rule 21: the office-hours rule, pinned down as pure functions.
//
// These cases run against src/lib/messaging/officeHours.ts directly, with
// fixed instants, because the rule is about wall-clock time in Europe/London
// and the two nights a year the clocks change are exactly where a rule like
// this goes wrong. The runtime enforcement — that a held message is unreachable
// by its recipient — is messaging-office-hours.spec.ts; this file is about the
// arithmetic underneath it being right.
//
// Calendar facts the fixtures rely on (checked in the first test so a typo in
// a date fails loudly rather than silently testing the wrong day):
//   2026-09-07 Monday   2026-09-11 Friday   2026-09-14 Monday
//   2026-03-29 Sunday   clocks go FORWARD at 01:00 UTC (GMT → BST)
//   2026-10-25 Sunday   clocks go BACK at 01:00 UTC (BST → GMT)
// ===========================================================================

const LONDON = "Europe/London";

// Monday to Friday, 08:00–16:00.
const WEEKDAYS_8_TO_4: Policy = {
  timezone: LONDON,
  closures: [],
  windows: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, openMinute: 8 * 60, closeMinute: 16 * 60 })),
};

const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

test("the calendar facts these fixtures rely on", () => {
  expect(weekdayOf("2026-09-07")).toBe(1);
  expect(weekdayOf("2026-09-11")).toBe(5);
  expect(weekdayOf("2026-09-14")).toBe(1);
  expect(weekdayOf("2026-03-29")).toBe(0);
  expect(weekdayOf("2026-10-25")).toBe(0);
});

test.describe("StoryJar's caps on what a school may choose", () => {
  test("the caps are six in the morning, eight at night and ten hours", () => {
    expect(EARLIEST_OPEN_MINUTE).toBe(6 * 60);
    expect(LATEST_CLOSE_MINUTE).toBe(20 * 60);
    expect(MAX_WINDOW_MINUTES).toBe(10 * 60);
  });

  test("7am–5pm and 8am–6pm are allowed; the examples the owner gave", () => {
    expect(validateWindow({ weekday: 1, openMinute: 7 * 60, closeMinute: 17 * 60 })).toBeNull();
    expect(validateWindow({ weekday: 1, openMinute: 8 * 60, closeMinute: 18 * 60 })).toBeNull();
    expect(validateWindow({ weekday: 1, openMinute: 9 * 60, closeMinute: 15 * 60 })).toBeNull();
  });

  test("outside the caps is refused, whichever way it is outside", () => {
    expect(validateWindow({ weekday: 1, openMinute: 5 * 60, closeMinute: 15 * 60 })).toBe("TOO_EARLY");
    expect(validateWindow({ weekday: 1, openMinute: 11 * 60, closeMinute: 20 * 60 + 30 })).toBe("TOO_LATE");
    expect(validateWindow({ weekday: 1, openMinute: 7 * 60, closeMinute: 18 * 60 })).toBe("TOO_LONG"); // eleven hours
    expect(validateWindow({ weekday: 1, openMinute: 6 * 60, closeMinute: 16 * 60 + 1 })).toBe("TOO_LONG");
    expect(validateWindow({ weekday: 1, openMinute: 9 * 60, closeMinute: 9 * 60 })).toBe("BACKWARDS");
    expect(validateWindow({ weekday: 1, openMinute: 10 * 60, closeMinute: 9 * 60 })).toBe("BACKWARDS");
    expect(validateWindow({ weekday: 7, openMinute: 9 * 60, closeMinute: 10 * 60 })).toBe("BAD_WEEKDAY");
    expect(validateWindow({ weekday: 1.5, openMinute: 9 * 60, closeMinute: 10 * 60 })).toBe("BAD_WEEKDAY");
  });

  test("exactly ten hours at the edges is allowed", () => {
    expect(validateWindow({ weekday: 1, openMinute: 6 * 60, closeMinute: 16 * 60 })).toBeNull();
    expect(validateWindow({ weekday: 1, openMinute: 10 * 60, closeMinute: 20 * 60 })).toBeNull();
  });

  test("an invalid window is ignored at evaluation time, never honoured", () => {
    const bad: Policy = { ...WEEKDAYS_8_TO_4, windows: [{ weekday: 1, openMinute: 0, closeMinute: 24 * 60 }] };
    expect(hasAnyOpening(bad)).toBe(false);
    expect(isOpenAt(new Date("2026-09-07T02:00:00Z"), bad)).toBe(false);
    expect(nextOpeningAfter(new Date("2026-09-07T02:00:00Z"), bad)).toBeNull();
  });
});

test.describe("open or shut, in London time", () => {
  test("11:00 BST on a Monday is open; 07:30 BST is not", () => {
    expect(isOpenAt(new Date("2026-09-07T10:00:00Z"), WEEKDAYS_8_TO_4)).toBe(true); // 11:00 BST
    expect(isOpenAt(new Date("2026-09-07T06:30:00Z"), WEEKDAYS_8_TO_4)).toBe(false); // 07:30 BST
  });

  test("the window is half-open: open at 08:00, shut at 16:00", () => {
    expect(isOpenAt(new Date("2026-09-07T07:00:00Z"), WEEKDAYS_8_TO_4)).toBe(true); // 08:00 BST exactly
    expect(isOpenAt(new Date("2026-09-07T14:59:00Z"), WEEKDAYS_8_TO_4)).toBe(true); // 15:59 BST
    expect(isOpenAt(new Date("2026-09-07T15:00:00Z"), WEEKDAYS_8_TO_4)).toBe(false); // 16:00 BST exactly
  });

  test("weekends are shut when no weekend window exists", () => {
    expect(isOpenAt(new Date("2026-09-12T10:00:00Z"), WEEKDAYS_8_TO_4)).toBe(false); // Saturday
    expect(isOpenAt(new Date("2026-09-13T10:00:00Z"), WEEKDAYS_8_TO_4)).toBe(false); // Sunday
  });

  test("a closure date shuts the whole day", () => {
    const inset: Policy = { ...WEEKDAYS_8_TO_4, closures: ["2026-09-07"] };
    expect(isOpenAt(new Date("2026-09-07T10:00:00Z"), inset)).toBe(false);
    expect(isOpenAt(new Date("2026-09-08T10:00:00Z"), inset)).toBe(true);
  });
});

test.describe("when a held message arrives", () => {
  test("written while open, it arrives at once", () => {
    const at = new Date("2026-09-07T10:00:00Z");
    expect(deliveryTimeFor(at, WEEKDAYS_8_TO_4)?.getTime()).toBe(at.getTime());
  });

  test("written at 07:30, it arrives at 08:00 the same morning", () => {
    const at = new Date("2026-09-07T06:30:00Z");
    expect(deliveryTimeFor(at, WEEKDAYS_8_TO_4)?.toISOString()).toBe("2026-09-07T07:00:00.000Z");
  });

  test("written at 21:40 on a Monday, it arrives at 08:00 on Tuesday", () => {
    const at = new Date("2026-09-07T20:40:00Z");
    expect(deliveryTimeFor(at, WEEKDAYS_8_TO_4)?.toISOString()).toBe("2026-09-08T07:00:00.000Z");
  });

  test("written on Friday evening, it waits until Monday morning", () => {
    const at = new Date("2026-09-11T16:00:00Z"); // 17:00 BST Friday
    expect(deliveryTimeFor(at, WEEKDAYS_8_TO_4)?.toISOString()).toBe("2026-09-14T07:00:00.000Z");
  });

  test("a closure on Monday pushes it to Tuesday", () => {
    const inset: Policy = { ...WEEKDAYS_8_TO_4, closures: ["2026-09-14"] };
    const at = new Date("2026-09-11T16:00:00Z");
    expect(deliveryTimeFor(at, inset)?.toISOString()).toBe("2026-09-15T07:00:00.000Z");
  });

  test("a message is never delivered before it was written", () => {
    for (const iso of ["2026-09-07T06:30:00Z", "2026-09-07T10:00:00Z", "2026-09-11T16:00:00Z", "2026-09-12T10:00:00Z"]) {
      const at = new Date(iso);
      const when = deliveryTimeFor(at, WEEKDAYS_8_TO_4);
      expect(when).not.toBeNull();
      expect(when!.getTime()).toBeGreaterThanOrEqual(at.getTime());
    }
  });

  test("a school with every day shut can never receive a message: null, not limbo", () => {
    const shut: Policy = { ...WEEKDAYS_8_TO_4, windows: [] };
    expect(hasAnyOpening(shut)).toBe(false);
    expect(deliveryTimeFor(new Date("2026-09-07T10:00:00Z"), shut)).toBeNull();
  });

  test("a fortnight of closures is also null", () => {
    const closures: string[] = [];
    for (let d = 7; d <= 25; d++) closures.push(`2026-09-${String(d).padStart(2, "0")}`);
    const shut: Policy = { ...WEEKDAYS_8_TO_4, closures };
    expect(deliveryTimeFor(new Date("2026-09-07T10:00:00Z"), shut)).toBeNull();
  });
});

test.describe("the two nights the clocks change", () => {
  test("08:00 London is 08:00 UTC in March before the change and 07:00 UTC after it", () => {
    expect(localToInstant(2026, 3, 27, 8 * 60, LONDON).toISOString()).toBe("2026-03-27T08:00:00.000Z"); // Friday, GMT
    expect(localToInstant(2026, 3, 30, 8 * 60, LONDON).toISOString()).toBe("2026-03-30T07:00:00.000Z"); // Monday, BST
  });

  test("08:00 London is 07:00 UTC in October before the change and 08:00 UTC after it", () => {
    expect(localToInstant(2026, 10, 23, 8 * 60, LONDON).toISOString()).toBe("2026-10-23T07:00:00.000Z"); // Friday, BST
    expect(localToInstant(2026, 10, 26, 8 * 60, LONDON).toISOString()).toBe("2026-10-26T08:00:00.000Z"); // Monday, GMT
  });

  test("written during the skipped hour in March, it lands at Monday 08:00 BST", () => {
    // 01:30 UTC on 29 March is 02:30 BST: the clocks have just gone forward.
    const at = new Date("2026-03-29T01:30:00Z");
    expect(deliveryTimeFor(at, WEEKDAYS_8_TO_4)?.toISOString()).toBe("2026-03-30T07:00:00.000Z");
  });

  test("the repeated hour in October delivers once, at Monday 08:00 GMT, whichever pass it was written in", () => {
    const firstPass = new Date("2026-10-25T00:30:00Z"); // 01:30 BST
    const secondPass = new Date("2026-10-25T01:30:00Z"); // 01:30 GMT, an hour later
    const a = deliveryTimeFor(firstPass, WEEKDAYS_8_TO_4)!;
    const b = deliveryTimeFor(secondPass, WEEKDAYS_8_TO_4)!;
    expect(a.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(b.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(a.getTime()).toBeGreaterThan(firstPass.getTime());
    expect(b.getTime()).toBeGreaterThan(secondPass.getTime());
  });

  test("a Friday-afternoon message in October crosses the change and still lands at 08:00 on the clock", () => {
    const at = new Date("2026-10-23T16:30:00Z"); // 17:30 BST, Friday, already shut
    expect(deliveryTimeFor(at, WEEKDAYS_8_TO_4)?.toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });
});

test.describe("what the sender is told", () => {
  test("names the next opening, never a duration", () => {
    const friday = new Date("2026-09-11T16:00:00Z");
    const monday = deliveryTimeFor(friday, WEEKDAYS_8_TO_4)!;
    expect(describeOpening(monday, friday)).toBe("at 8:00am on Monday");

    const earlyMonday = new Date("2026-09-07T06:30:00Z");
    expect(describeOpening(deliveryTimeFor(earlyMonday, WEEKDAYS_8_TO_4)!, earlyMonday)).toBe("at 8:00am today");

    const lateMonday = new Date("2026-09-07T20:40:00Z");
    expect(describeOpening(deliveryTimeFor(lateMonday, WEEKDAYS_8_TO_4)!, lateMonday)).toBe("at 8:00am tomorrow");
  });

  test("a week or more away gets the date", () => {
    const closures: string[] = [];
    for (let d = 14; d <= 18; d++) closures.push(`2026-09-${d}`);
    const halfTerm: Policy = { ...WEEKDAYS_8_TO_4, closures };
    const friday = new Date("2026-09-11T16:00:00Z");
    expect(describeOpening(deliveryTimeFor(friday, halfTerm)!, friday)).toBe("at 8:00am on Monday 21 September");
  });

  test("times read the way a parent says them", () => {
    expect(formatMinute(8 * 60)).toBe("8:00am");
    expect(formatMinute(16 * 60 + 30)).toBe("4:30pm");
    expect(formatMinute(12 * 60)).toBe("12:00pm");
    expect(formatMinute(0)).toBe("12:00am");
  });
});

test.describe("form input", () => {
  test("parses HH:MM and refuses anything else", () => {
    expect(parseMinute("08:00")).toBe(480);
    expect(parseMinute("8:05")).toBe(485);
    expect(parseMinute("24:00")).toBeNull();
    expect(parseMinute("08:60")).toBeNull();
    expect(parseMinute("eight")).toBeNull();
    expect(parseMinute("")).toBeNull();
  });

  test("closure dates must be real calendar dates", () => {
    expect(isClosureDate("2026-09-07")).toBe(true);
    expect(isClosureDate("2026-02-30")).toBe(false);
    expect(isClosureDate("2026-13-01")).toBe(false);
    expect(isClosureDate("07/09/2026")).toBe(false);
    expect(isClosureDate("2026-9-7")).toBe(false);
  });
});
