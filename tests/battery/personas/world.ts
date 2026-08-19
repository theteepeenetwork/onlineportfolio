// ===========================================================================
// Bramblewood Primary — the environment the tester team works in.
//
// Mirrors prisma/seed-personas.ts. Everything here is fictional, and every
// address is on a .test domain, which can never resolve or receive mail.
//
// The personas hold real accounts in a real school with real (fictional)
// children, work in every state, live activities and a live quiz — because a
// tester who cannot sign in as a teacher, set an activity, watch a child do it,
// send it back with feedback and see the parent's view of the result is not
// testing the product, only the login page.
// ===========================================================================

export const ACADEMY = {
  name: "Bramblewood Primary",

  /** Holds the account: staff, billing, and the school's data-protection duty. */
  admin: { email: "head@bramblewood.test", password: "password", display: "Mrs Hartley" },

  /** Class teacher for three of the four classes — the daily-driver account. */
  teacher: { email: "reeves@bramblewood.test", password: "password", display: "Mr Reeves" },

  /** A second teacher, so handovers and reassignment have somewhere to go. */
  colleague: { email: "osei@bramblewood.test", password: "password", display: "Miss Osei" },

  /** The least-tested permission set in the product. */
  ta: { email: "ta@bramblewood.test", password: "password", display: "Sam" },

  /** Invited, never activated: the staff row an admin removes. */
  removableStaff: { email: "chris.vale@bramblewood.test", name: "Chris Vale" },

  classes: {
    eyfs: { name: "Ducklings", code: "DUCK01", year: "Reception", children: ["Bo", "Pip", "Sky"] },
    ks1: { name: "Robins", code: "ROBN01", year: "Year 2", children: ["Nell", "Otis", "Rae", "Tia", "Vik", "Wes"] },
    ks2: { name: "Herons", code: "HERN01", year: "Year 6", children: ["Wren", "Xan", "Yara", "Zeb"] },
    colleague: { name: "Kestrels", code: "KEST01", year: "Year 1", children: ["Ada", "Bex", "Cal"] },
    /** Has a pupil and a moment in it, and exists to be deleted. */
    deletable: { name: "Wrens (old)", code: "WREN01", year: "Year 3", children: ["Quill"] },
  },

  parents: {
    /** Two children, in two different classes and two different registers. */
    siblings: { code: "BRAM01", email: "dani.brambles@bramblewood.test", children: ["Nell", "Wren"] },
    /** Exists to have its access taken away. */
    removable: { code: "BRAM02", email: "jo.fields@bramblewood.test", children: ["Bo"] },
  },

  activities: {
    ks1: "Minibeast hunt",
    /** A real multiple-choice quiz with two questions and picture answers. */
    quiz: "Count the ducks",
    ks2: "Explain your method",
    archived: "Summer term: pond dipping",
  },

  /** Work already in the states a journey needs to find. */
  waiting: { child: "Nell", other: "Otis" },
  returned: { child: "Wren", note: /show me each step/i },
  stickered: { child: "Bo" },
} as const;
