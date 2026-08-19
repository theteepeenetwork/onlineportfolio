// ===========================================================================
// The user-tester team.
//
// Nine people (and one bot) who use Storyjar the way real people do: with a
// device they already own, a reading age, a job to get done, and a limited
// amount of patience. Every persona spec drives the REAL app through a REAL
// journey and writes down what was confusing, breakable, slow or broken.
//
// WHY PERSONAS RATHER THAN MORE ASSERTIONS
//
// The rest of the battery asks "is this correct?". A tester asks "could I do
// it, and did I understand what happened?" — a question that has no single
// expected value, so it cannot be written as `expect(x).toBe(y)`. Instead each
// persona records OBSERVATIONS (see tester.ts) which are aggregated into
// USER_TESTING.md by `npm run test:personas`.
//
// The one thing a persona CAN fail on is a blocker: an unhandled error, a 5xx,
// or a job they could not finish. Those end the test red even though this
// project is report-only in CI, because a persona who cannot do their job is
// not a matter of taste.
//
// WHO THESE PEOPLE ARE NOT: they are not the fixture rows. The fixtures
// (prisma/seed-test.ts) supply the accounts; the personas supply the context —
// device, reading age, patience — that decides whether a screen works FOR THEM.
// A 44px button is fine for Rosa on a laptop and a miss for Ava, aged four, on
// a tablet with a sticky screen protector.
// ===========================================================================

/** How well this person reads. Decides what counts as "unreadable copy". */
export type ReadingAge = "none" | "early" | "fluent" | "adult";

/** Which hat they wear. Groups the report and picks the touch-target floor. */
export type Hat = "child" | "teacher" | "admin" | "parent" | "operator";

export type Persona = {
  /** Stable id — used in file names and in the report. */
  id: string;
  /** What the report calls them. */
  name: string;
  hat: Hat;
  /** One line: who they are and what they are trying to do. */
  who: string;
  device: {
    label: string;
    width: number;
    height: number;
    /** Fingers, not a mouse: hover states and :hover-only affordances do not exist. */
    touch: boolean;
    /**
     * Emulate a mobile browser (meta viewport honoured, mobile UA). Without it a
     * narrow window is only a narrow desktop, and a page that relies on
     * `width=device-width` would be judged for a fault it does not have.
     */
    mobile: boolean;
  };
  /**
   * The smallest thing this person can reliably hit, in CSS pixels.
   * SAFEGUARDING rule 18 asks ≥64px for anything a child must touch; the
   * WCAG 2.2 AA floor for everyone else is 44px.
   */
  minTarget: number;
  reads: ReadingAge;
  /**
   * How long a screen may take before this person decides it is broken.
   * A child taps again (and double-submits); a teacher mid-lesson gives up.
   */
  patienceMs: number;
  /** The longest word this person can decode without help. 0 = don't check. */
  longestWord: number;
};

// The floor each person is judged against, and where it comes from.
//
// One number for everybody was wrong in both directions: it reported a mouse
// user's 32px nav link as a defect (WCAG 2.2 AA asks 24px, and a pointer is
// precise), while letting a four-year-old's tile through at 44.
const CHILD_TARGET = 64; // SAFEGUARDING rule 18 — anything a child must touch
const TOUCH_TARGET = 44; // an adult's finger on a tablet or phone
const POINTER_TARGET = 24; // WCAG 2.2 AA 2.5.8, which is what a mouse user is owed

export const TEAM = {
  // -------------------------------------------------------------------------
  // Adults
  // -------------------------------------------------------------------------

  /** The whole of Storyjar's staff. If he cannot see it, nobody can. */
  operator: {
    id: "operator",
    name: "Ravi · platform operator",
    hat: "operator",
    who: "Runs Storyjar single-handed. Opens the console between other jobs, on a laptop, and needs to answer 'is anything on fire, and can I fix it from here?' without reading a manual.",
    device: { label: "work laptop", width: 1440, height: 900, touch: false, mobile: false },
    minTarget: POINTER_TARGET,
    reads: "adult",
    patienceMs: 5_000,
    longestWord: 0,
  },

  /** Signed up last night; has 20 minutes before the children arrive. */
  newTeacher: {
    id: "new-teacher",
    name: "Ms Blake · brand-new teacher",
    hat: "teacher",
    who: "Year 1 teacher who signed up from a leaflet and has never seen the product. Has twenty minutes before the bell to get a class in and understand what the children will see.",
    device: { label: "staffroom laptop", width: 1280, height: 720, touch: false, mobile: false },
    minTarget: POINTER_TARGET,
    reads: "adult",
    patienceMs: 4_000,
    longestWord: 0,
  },

  /** Uses it every day, one-handed, mid-lesson. */
  busyTeacher: {
    id: "busy-teacher",
    name: "Mr Reeves · teacher mid-lesson",
    hat: "teacher",
    who: "Teaches Robins at Bramblewood and uses Storyjar while the lesson is still going on — standing up, iPad in one hand, interrupted every ninety seconds. Wants the approval queue cleared before playtime.",
    device: { label: "classroom iPad, landscape", width: 1024, height: 768, touch: true, mobile: true },
    minTarget: TOUCH_TARGET,
    reads: "adult",
    patienceMs: 3_000,
    longestWord: 0,
  },

  /** Buys it, runs the staff list, and answers to the data protection lead. */
  schoolAdmin: {
    id: "school-admin",
    name: "Mrs Hartley · school business manager",
    hat: "admin",
    who: "Holds the school's Storyjar account. Invites staff, watches the bill, and has to be able to show the DPO what is stored and get it out again. Not a teacher; will not guess at jargon.",
    device: { label: "school desktop", width: 1366, height: 768, touch: false, mobile: false },
    minTarget: POINTER_TARGET,
    reads: "adult",
    patienceMs: 5_000,
    longestWord: 0,
  },

  /** The account that has lapsed — the least-tested state in the product. */
  frozenAdmin: {
    id: "frozen-admin",
    name: "Mrs Frost · admin of a lapsed school",
    hat: "admin",
    who: "Larchwood's trial ended and nobody noticed. She still needs the children's work — and needs to understand, without ringing anyone, why the buttons no longer do anything and what she must do to fix it.",
    device: { label: "school desktop", width: 1366, height: 768, touch: false, mobile: false },
    minTarget: POINTER_TARGET,
    reads: "adult",
    patienceMs: 5_000,
    longestWord: 0,
  },

  /**
   * The person actually handed the tablet. A TA is in the room with the
   * children more often than the class teacher, and their permissions are the
   * least exercised thing in the product.
   */
  assistant: {
    id: "assistant",
    name: "Sam · teaching assistant",
    hat: "teacher",
    who: "Supports Robins three mornings a week and is usually the adult holding the tablet. Was given a login and no training, and needs to know what they are and are not allowed to do before they do it by accident.",
    device: { label: "classroom iPad, landscape", width: 1024, height: 768, touch: true, mobile: true },
    minTarget: TOUCH_TARGET,
    reads: "adult",
    patienceMs: 3_000,
    longestWord: 0,
  },

  /** At home, on a phone, at 9pm, with no training and no login. */
  parent: {
    id: "parent",
    name: "Dani · a parent at home",
    hat: "parent",
    who: "Got a letter home with a code on it. On a phone, in the evening, one-handed, with a toddler on her lap. Has never been told what Storyjar is and will not create an account to find out.",
    device: { label: "phone", width: 390, height: 844, touch: true, mobile: true },
    minTarget: TOUCH_TARGET,
    reads: "adult",
    patienceMs: 4_000,
    longestWord: 0,
  },

  // -------------------------------------------------------------------------
  // Children. The touch-target floor is 64px and the copy check is real: a
  // child who cannot read the word cannot use the button, however pretty it is.
  // -------------------------------------------------------------------------

  /** Reception, aged 4. Cannot read. Navigates entirely by picture. */
  eyfsChild: {
    id: "child-eyfs",
    name: "Bo · Reception, aged 4",
    hat: "child",
    who: "In Ducklings. Cannot read a single word yet: she finds things by shape, colour and picture, taps with a whole finger, and if a screen changes under her she thinks she has broken it and stops.",
    device: { label: "classroom tablet", width: 768, height: 1024, touch: true, mobile: true },
    minTarget: CHILD_TARGET,
    reads: "none",
    patienceMs: 2_500,
    longestWord: 6,
  },

  /** Year 2, aged 6. Decodes short words slowly. */
  ks1Child: {
    id: "child-ks1",
    name: "Nell · Year 2, aged 6",
    hat: "child",
    who: "In Robins. Sounds out short words and gives up on long ones. Knows the jar is his. Will happily tap the same button four times if nothing appears to happen.",
    device: { label: "classroom tablet", width: 768, height: 1024, touch: true, mobile: true },
    minTarget: CHILD_TARGET,
    reads: "early",
    patienceMs: 2_500,
    longestWord: 9,
  },

  /** Year 6, aged 10. Reads fluently — and pokes at the edges. */
  ks2Child: {
    id: "child-ks2",
    name: "Wren · Year 6, aged 10",
    hat: "child",
    who: "In Herons. Reads everything, including the bits meant for adults. Uses the browser back button, reloads mid-task, opens two tabs, and tries things on purpose to see what happens.",
    device: { label: "classroom laptop", width: 1280, height: 720, touch: true, mobile: false },
    minTarget: CHILD_TARGET,
    reads: "fluent",
    patienceMs: 3_000,
    longestWord: 14,
  },

  /**
   * The bot. Not a person: a child-shaped fuzzer inside a real child's session.
   * It taps visible things in an order nobody designed for, to find the states
   * a scripted journey never reaches.
   */
  wriggler: {
    id: "child-wriggler",
    name: "The Wriggler · a bot in a child's session",
    hat: "child",
    who: "Signs in as a real child and then taps whatever is in front of it — twice, quickly, in the wrong order, with a reload in the middle. Exists to find the states a designed journey never visits.",
    device: { label: "classroom tablet", width: 768, height: 1024, touch: true, mobile: true },
    minTarget: CHILD_TARGET,
    reads: "none",
    patienceMs: 2_500,
    longestWord: 0,
  },
} as const satisfies Record<string, Persona>;

export type TeamMember = keyof typeof TEAM;

// ---------------------------------------------------------------------------
// Where the team works: their own school, Bramblewood Primary — accounts, class
// codes, children and content in tests/battery/personas/world.ts, seeded by
// prisma/seed-personas.ts.
//
// They do NOT borrow St Bede's or Oakfield. Those fixtures are read by the
// security and a11y gates in a known state, and these personas delete staff,
// classes and family access. One exception, and it is deliberate: Mrs Frost
// signs in to School C (Larchwood), because a lapsed, read-only account is a
// state worth testing and one already exists.
// ---------------------------------------------------------------------------
export { ACADEMY } from "./world";
