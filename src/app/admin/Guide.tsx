import Link from "next/link";
import { CARD, TABS, type Tab } from "./tabs";

// The admin console's guide: what a school admin can actually do, in the order a
// person asks it, with the way to each thing one tap away.
//
// It is deliberately plain prose and static — no counts, no names, nothing read
// from the database. A guide that reported on the school would be a second,
// unaudited window onto it (SAFEGUARDING rules 5 and 16); this one is a map.

type Item = {
  title: string;
  what: string;
  how: string;
  /** Jump to another tab in this console. */
  goTo?: Tab;
  /** Or leave the console entirely. */
  href?: string;
  linkLabel?: string;
};

const ADMIN_JOBS: Item[] = [
  {
    title: "Invite a colleague",
    what: "Adds a member of staff to the school and emails them their way in.",
    how: "Staff → Invite staff. Give their name, school email and role. They show as “Invited” until they accept, and you can resend the invite from the ⋯ menu on their row.",
    goTo: "staff",
  },
  // This card used to be titled "Change what a colleague can do" and described
  // moving somebody between the three roles. That was a false statement: every
  // access check in StoryJar asks whether you are an ADMIN, so Teacher and
  // Teaching assistant are identical in what they permit, and an admin who
  // moved a colleague between them believed they had limited someone they had
  // not. Logged as F47. What actually decides access is which classes you hold,
  // so that is what the guide now says.
  {
    title: "Record what a colleague's job is",
    what:
      "Marks somebody as an admin, a teacher or a teaching assistant. Admin is the one that changes " +
      "what they can do: it opens this console. Teacher and teaching assistant are the same as each " +
      "other in what StoryJar lets them do — the difference is your record of who they are.",
    how: "Staff → the ⋯ menu on their row → Edit role. The change is recorded in the audit log with your name against it.",
    goTo: "staff",
  },
  // The card that actually answers "what can this person see?", which is the
  // question the role picker above looks like it answers and does not. Kept as
  // one card rather than two: an earlier draft of the F47 fix added a second
  // card about assigning classes beside this one, which is the same job
  // described twice — and a guide that says a thing twice is a guide people
  // stop reading.
  {
    title: "Give a colleague a class",
    what:
      "This is the one that decides what they can see. Outside this console, everything a member of " +
      "staff can reach follows the classes they hold — their queue, their journals, their children's " +
      "work. Somebody with no class sees empty screens, whatever their role says.",
    how: "Staff → the ⋯ menu on their row → Assign classes. A class has one teacher, so giving it to somebody takes it from whoever held it.",
    goTo: "staff",
  },
  {
    title: "Remove someone who has left",
    what: "Ends their access to the school straight away.",
    how: "Staff → the ⋯ menu → Remove from school. Assign their classes to someone else first: a class follows the teacher who holds it, so hand it over before you remove them.",
    goTo: "staff",
  },
  {
    title: "See who did what",
    what: "A running record of the actions that matter for safeguarding — moments approved, sent back or deleted, and every staff and role change.",
    how: "Audit log. It is written by StoryJar, not by hand, and nobody in the school can edit it.",
    goTo: "audit",
  },
  {
    title: "Set a class up from your register",
    what: "Creates a class with its children already in it, from a pasted list of names.",
    how: "Classes → Paste a class list. Choose whose class it is, paste the names column out of SIMS, Arbor, Bromcom or a spreadsheet, and it is ready. Only first names are kept — surnames are dropped as they arrive. Setting a class up does not give you access to the children's work.",
    goTo: "classes",
  },
  {
    title: "Hand a class to a different teacher",
    what: "Moves a class, its children and its queue to someone else.",
    how: "Classes → change the teacher on that row. The old teacher loses access to it the moment you do, and the change is in the audit log.",
    goTo: "classes",
  },
  {
    title: "Start, renew or pay for the plan",
    what: "Everything the school needs to buy Storyjar or keep it running — the band, the price, the renewal date, and both ways of paying.",
    how: "Billing. Pick the band by pupils on roll, then pay by card (a school credit or purchasing card is fine) or ask for an invoice against a purchase order with 30 days to pay. One price for the whole school — nothing is counted per teacher.",
    goTo: "billing",
  },
];

const CLASSROOM_JOBS: Item[] = [
  {
    title: "Approve today's moments",
    what: "Nothing a child makes reaches their jar, or their family, until you have looked at it.",
    how: "The Queue. Approve it, or send it back with a note and a sticker so the child knows what to do next.",
    href: "/teacher/queue",
    linkLabel: "Open the queue",
  },
  {
    title: "Look through a child's jar",
    what: "Everything you have approved for one child, in order.",
    how: "Journals, then the child's name.",
    href: "/teacher",
    linkLabel: "Open journals",
  },
  {
    title: "Set work for the class",
    what: "Build an activity once — a worksheet, a drawing, a quiz — and assign it to a class or to particular children.",
    how: "Activities. Assigned work shows up on the Calendar.",
    href: "/teacher/activities",
    linkLabel: "Open activities",
  },
  {
    title: "Make a class, and get its code",
    what: "A class code is how children sign in: they type the code and tap their own name. They have no login, no email and no password.",
    how: "My classes. The same screen sets the age group (EYFS, KS1 or KS2), which changes the wording and type size children see.",
    href: "/teacher/class",
    linkLabel: "Open my classes",
  },
  {
    title: "Send a family their code",
    what: "A parent gets read-only access to their own child's approved work, and nothing else.",
    how: "Open a child from Journals, then Family access. Print the letter and send the code home on paper — StoryJar never asks you for a parent's email or phone number.",
    href: "/teacher",
    linkLabel: "Open journals",
  },
  {
    title: "Take a copy of a class",
    what: "Everything in a class, downloaded — for your records, for a leaver, or for the end of the year.",
    how: "My classes → Export class data.",
    href: "/teacher/class",
    linkLabel: "Open my classes",
  },
  // The per-pupil export had no card here at all, which was the actual gap: the
  // guide described the class export and left the one a parent's request
  // produces undescribed. The operational sentence is the point of the card —
  // generate, read, release — and it is written as ordinary practice rather
  // than as a StoryJar peculiarity, because that is what it is. The legal
  // position and the timescale are the owner's to state, not this page's.
  {
    title: "Answer a parent asking what you hold about their child",
    what:
      "One pupil's whole record, downloaded — every piece of work, when it arrived, and the file " +
      "names of their photos, drawings and voice notes.",
    how:
      "Journals → open the child → Export their data. Generate it, read it, then send it: an export " +
      "can surface work a child started and abandoned, or a note a teacher wrote when sending work " +
      "back, so a person reads the file before it leaves the school. That is the usual way a request " +
      "like this is answered.",
    href: "/teacher",
    linkLabel: "Open journals",
  },
];

// The other half of a useful guide: the things people go looking for, that are
// missing on purpose. Each of these is a promise on the Promises tab.
const NOT_POSSIBLE: string[] = [
  "See children's work across the whole school. Even as an admin, you see a child's work only if you teach that class.",
  "Give a child a login, an email address or a password. Children sign in with a class code and their own name.",
  "Store a child's surname, birthday, address or contact details. First names and their work, and that is all.",
  "Take a parent's email or phone number from the school. A parent gives us an address themselves, or we hold none.",
  "Let children message each other. There is no child-to-child contact in StoryJar of any kind.",
  "Show a child's work to anybody before a teacher has approved it.",
];

export function Guide({ onGoTo }: { onGoTo: (tab: Tab) => void }) {
  return (
    <div style={{ marginTop: 24, display: "grid", gap: 26 }}>
      <div className="sj-card" style={{ ...CARD, padding: "22px 24px" }}>
        <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Start here</h2>
        <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
          You wear two hats. As an <strong>admin</strong> you run the school side — staff, roles, classes and the
          plan. As a <strong>teacher</strong> you have your own classes, your own queue and your own children, in
          exactly the same way as every colleague. This page is a map of both, and of the things StoryJar will not
          do at all. What we promise about children&apos;s work, and what happens when something goes wrong, is on the{" "}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onGoTo("promises"); }}
            style={LINK_BTN}
          >
            Promises &amp; procedures
          </button>{" "}
          tab.
        </p>
      </div>

      <Section
        heading="Whole-school jobs"
        blurb="Only an admin can do these. They all happen in this console."
        items={ADMIN_JOBS}
        onGoTo={onGoTo}
      />

      <Section
        heading="Your own classroom"
        blurb="Every teacher has these, including you. They live in your teaching space, not here."
        items={CLASSROOM_JOBS}
        onGoTo={onGoTo}
      />

      <September />

      <div className="sj-card" style={{ ...CARD, padding: "22px 24px" }}>
        <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Things StoryJar will not do</h2>
        <p style={{ margin: "8px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
          These are missing on purpose, so you can stop looking for them — and tell a colleague or a parent why.
        </p>
        <ul style={{ margin: "12px 0 0", paddingLeft: 20, font: "400 16px/1.7 var(--font-atkinson)", color: "#43506B" }}>
          {NOT_POSSIBLE.map((line) => <li key={line} style={{ marginTop: 6 }}>{line}</li>)}
        </ul>
      </div>

      <div className="sj-card" style={{ ...CARD, padding: "22px 24px" }}>
        <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>If you are stuck</h2>
        <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
          Email <strong>hello@storyjar.co.uk</strong> and say what you were trying to do. For anything about a
          child&apos;s safety, your school&apos;s Designated Safeguarding Lead comes first — see{" "}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onGoTo("promises"); }}
            style={LINK_BTN}
          >
            Raising a concern
          </button>.
        </p>
      </div>
    </div>
  );
}

// September, written out by hand.
//
// StoryJar does not roll a school over, and saying nothing about that leaves an
// admin in September with a screen full of last year's classes and no idea what
// they are supposed to do with them. This is the process, in the order it has to
// happen, with the awkward parts named rather than skated over.
//
// Every claim below was checked against the code on 23 August 2026, because a
// wrong instruction here costs a school a year of children's work:
//   - a class's name and year group CANNOT be changed. db.class.update is called
//     in exactly three places and it writes ageMode, classCode and teacherId and
//     nothing else (actions/classes.ts:93,148 and actions/admin.ts:87).
//   - there is no "move a pupil to another class". removeStudent calls
//     eraseStudent (actions/roster.ts:82) — rows, media files and any family
//     space left behind. It is real erasure, so it is never a way to move a
//     child.
//   - a class has ONE teacher (Class.teacherId), and assignClassToStaff moves it
//     rather than sharing it.
// If any of those three change, this card is wrong and must change with them.
function September() {
  return (
    <div className="sj-card" style={{ ...CARD, padding: "22px 24px" }}>
      <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>September: moving your classes up a year</h2>
      <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
        StoryJar does not do this for you. It is a job you work through class by class, and it takes
        an afternoon for a one-form-entry school. The order matters, because one of the steps cannot
        be undone.
      </p>

      <h3 style={{ margin: "18px 0 0", font: "700 16px var(--font-atkinson)" }}>Before you change anything</h3>
      <ol style={{ margin: "8px 0 0", paddingLeft: 22, font: "400 16px/1.7 var(--font-atkinson)", color: "#43506B" }}>
        <li style={{ marginTop: 6 }}>
          <strong>Take a copy of every class you are finishing with.</strong> My classes &rarr; Export
          class data, one class at a time. Keep the files somewhere your school keeps records. This
          is the only copy that survives anything you do next.
        </li>
        <li style={{ marginTop: 6 }}>
          <strong>Take a copy for each child who is leaving you</strong> &mdash; Year 6, or anyone
          moving school. Open them from Journals and use &ldquo;Export their data&rdquo; under their
          name. It is the same file, for one child, and it is what you keep, or send on, if a
          family asks what the school holds.
        </li>
      </ol>

      <h3 style={{ margin: "18px 0 0", font: "700 16px var(--font-atkinson)" }}>Then, for each class, one of two things</h3>
      <p style={{ margin: "8px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
        It depends on what the class name means at your school.
      </p>
      <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
        <strong>If the class is the children</strong> &mdash; the name follows the same group up the
        school, like &ldquo;Miss Osei&rsquo;s class&rdquo; &mdash; then keep it. There is nothing to
        rebuild:
      </p>
      <ol style={{ margin: "8px 0 0", paddingLeft: 22, font: "400 16px/1.7 var(--font-atkinson)", color: "#43506B" }}>
        <li style={{ marginTop: 6 }}>Classes &rarr; change the teacher on that row, to whoever has them this year.</li>
        <li style={{ marginTop: 6 }}>The new teacher opens My classes &rarr; Class settings and sets the age group if the children have moved between EYFS, KS1 and KS2.</li>
        <li style={{ marginTop: 6 }}>Give the class a new code, so last year&rsquo;s stops letting anyone in. My classes &rarr; New class code&hellip; Print it and put it up.</li>
        <li style={{ marginTop: 6 }}>Add anyone who has joined, remove anyone who has left (see the warning below).</li>
      </ol>
      <p style={{ margin: "8px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        Everything the children have made stays with them, and their families keep the codes they
        already have. This is much the least work &mdash; take this path if your school can.
      </p>

      <p style={{ margin: "14px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
        <strong>If the class is the room</strong> &mdash; &ldquo;Ducklings&rdquo; is always Reception
        and a new set of children arrives in it &mdash; then make a new class for the new children:
      </p>
      <ol style={{ margin: "8px 0 0", paddingLeft: 22, font: "400 16px/1.7 var(--font-atkinson)", color: "#43506B" }}>
        <li style={{ marginTop: 6 }}>
          Classes &rarr; Paste a class list, and paste the names column straight out of SIMS, Arbor or
          Bromcom. Choose whose class it is and set the age group as you go. First names only &mdash;
          surnames are dropped as they arrive.
        </li>
        <li style={{ marginTop: 6 }}>Print the new class code and put it up where the children can see it.</li>
        <li style={{ marginTop: 6 }}>
          Send each family their code. Open the child from Journals &rarr; Family access &rarr; print
          the letter. <strong>A family code belongs to a child&rsquo;s record</strong>, so a child in
          a new class record needs a new code and a new letter, even if their family already had one.
          This is the slow part and there is no way round it.
        </li>
        <li style={{ marginTop: 6 }}>
          Leave last year&rsquo;s class alone for now. It is the record of what those children did,
          and you can still open it, read it and export it.
        </li>
      </ol>

      <h3 style={{ margin: "18px 0 0", font: "700 16px var(--font-atkinson)" }}>Three things to know before you start</h3>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20, font: "400 16px/1.7 var(--font-atkinson)", color: "#43506B" }}>
        <li style={{ marginTop: 6 }}>
          <strong>Removing a child really deletes their work.</strong> It takes their moments and
          their photos and drawings with it, and it cannot be undone. Export first, always. Only
          remove a child once you are sure &mdash; and never as a way of moving them somewhere else.
        </li>
        <li style={{ marginTop: 6 }}>
          <strong>A class name and its year group cannot be changed once the class exists.</strong>
          So a class called &ldquo;Year 2 2025-26&rdquo; will still say that next September. If you
          are naming classes now, a name that does not carry a year in it will save you this job.
        </li>
        <li style={{ marginTop: 6 }}>
          <strong>There is no way to move a child from one class to another and keep their journal.</strong>
          If a child changes class mid-year, the work they have already done stays in the class it
          was made in.
        </li>
      </ul>
    </div>
  );
}

function Section({
  heading,
  blurb,
  items,
  onGoTo,
}: {
  heading: string;
  blurb: string;
  items: Item[];
  onGoTo: (tab: Tab) => void;
}) {
  return (
    <section aria-labelledby={`guide-${heading.replace(/\s+/g, "-").toLowerCase()}`}>
      <h2 id={`guide-${heading.replace(/\s+/g, "-").toLowerCase()}`} style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>{heading}</h2>
      <p style={{ margin: "4px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>{blurb}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 14 }}>
        {items.map((it) => (
          <div key={it.title} className="sj-card" style={{ ...CARD, display: "flex", flexDirection: "column", gap: 6 }}>
            <h3 style={{ margin: 0, font: "700 16px var(--font-atkinson)" }}>{it.title}</h3>
            <p style={{ margin: 0, font: "400 15px/1.55 var(--font-atkinson)", color: "#43506B" }}>{it.what}</p>
            <p style={{ margin: 0, font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>{it.how}</p>
            <div style={{ marginTop: "auto", paddingTop: 8 }}>
              {it.goTo && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onGoTo(it.goTo as Tab); }} style={LINK_BTN}>
                  Go to {TABS.find((t) => t.id === it.goTo)?.label ?? it.goTo} →
                </button>
              )}
              {it.href && (
                <Link href={it.href} style={{ ...LINK_BTN, display: "inline-block", textDecoration: "underline" }}>
                  {it.linkLabel} →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const LINK_BTN: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "#C2476B",
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textDecoration: "underline",
};
