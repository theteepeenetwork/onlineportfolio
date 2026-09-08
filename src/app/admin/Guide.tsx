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
  //
  // AMENDED 2026-09-07, and the amendment is the whole reason to re-read this
  // comment: parent messaging (SAFEGUARDING rule 21) is the FIRST place the
  // role has an effect of its own. A teacher may message families by default
  // and a teaching assistant may not. That is deliberately NOT F47's deferred
  // "make TA restricted" work: nothing a TA could already do has been taken
  // away, a brand-new channel simply does not open for them by default, and an
  // admin can set it either way per person on the same menu. But it does mean
  // "the same as each other" is no longer true, and the card below says so
  // rather than leaving a school to find the exception by pressing things.
  {
    title: "Record what a colleague's job is",
    what:
      "Marks somebody as an admin, a teacher or a teaching assistant. Admin is the one that changes " +
      "most: it opens this console. Teacher and teaching assistant are otherwise the same in what " +
      "StoryJar lets them do with a class they hold — with one exception. Teachers may message " +
      "families and teaching assistants may not, until you say otherwise on the same menu.",
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
    // "The class they hold, and the work in it" — NOT "anything they held",
    // which this said for an afternoon and which is false. `handOverClasses`
    // deliberately does not move `ActivityTemplate.teacherId` (see its "WHAT
    // THIS MODULE DELIBERATELY DOES NOT DO" block): a template is the
    // author's own work. So a departing teacher's activity library leaves with
    // them, and an admin who removes a colleague on the last Friday of the
    // summer term finds next year's planning gone. Promising more than the
    // handover delivers is how an admin stops reading these sentences.
    what: "Ends their access to the school straight away. The class they hold, and the children's work in it, stays with the school.",
    // This used to say "assign their classes to someone else first: a class
    // follows the teacher who holds it". That stopped being true when the
    // automatic handover landed with F59, and by F68 it was advice that walked
    // an admin straight into deleting a class: it invited them to believe the
    // handover was their job, and doing nothing looked like the risky option.
    // It is the opposite — the safe thing is to press the button and read what
    // it says.
    how: "Staff → the ⋯ menu → Remove from school. You do not need to move their classes first: any class they hold comes to you automatically, with the children's work in it, and gets a new class code — the confirmation says exactly what will move before you press it.",
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
    title: "Send families their codes",
    what: "A parent gets read-only access to their own child's approved work, and nothing else.",
    how: "For a whole class at once: My classes → open the class → Family letters. That makes a code for anyone without one and prints every letter, one per sheet. For a single child: open them from Journals, then Family access. Either way the code goes home on paper — StoryJar never asks you for a parent's email or phone number.",
    href: "/teacher/class",
    linkLabel: "Open my classes",
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

// September.
//
// REWRITTEN 8 SEPTEMBER 2026, WHEN THE JOB STOPPED BEING MANUAL. This card used
// to be a hand-written procedure, because StoryJar could not roll a school over
// and saying nothing left an admin in September with a screen full of last
// year's classes. The Move-up tab now does it (docs/paid-tier-plan.md item 1),
// so what belongs here is what the screen cannot say for itself: the order, the
// two costs, and the one thing that is still real erasure.
//
// The old card's header made this rewrite a condition of the change, and it was
// right to. It listed three facts and said "if any of those three change, this
// card is wrong and must change with them". Two of them have:
//   - a class's name and year group CAN now change, by moving it up: the class
//     is recreated for next year and the children move across
//     (src/app/actions/rollover.ts).
//   - there IS now a way to move a child to another class and keep their
//     journal — `Student.classId` moves and `JournalItem.classId` does not, so
//     last year's work stays labelled with last year's class. `removeStudent`
//     is still real erasure and is still never the way to move anybody.
// The third is unchanged: a class has ONE teacher, and moving it hands it over
// rather than sharing it.
//
// Checked against the code on 8 September 2026. If the rollover stops archiving
// and starts deleting, or starts inferring the register from a year group, this
// card is wrong and must change with it.
function September() {
  return (
    <div className="sj-card" style={{ ...CARD, padding: "22px 24px" }}>
      <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>September: moving your classes up a year</h2>
      <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
        StoryJar does this for you now. The <strong>Move up</strong> tab lists every class with a row
        each: choose next year&rsquo;s teacher, name and year group, and the children move across with
        everything they have made. <strong>Nothing is deleted.</strong> Last year&rsquo;s class is kept,
        with last year&rsquo;s work still in it and still labelled with the class it was made in.
      </p>

      <h3 style={{ margin: "18px 0 0", font: "700 16px var(--font-atkinson)" }}>The order it has to happen in</h3>
      <ol style={{ margin: "8px 0 0", paddingLeft: 22, font: "400 16px/1.7 var(--font-atkinson)", color: "#43506B" }}>
        <li style={{ marginTop: 6 }}>
          <strong>Ask every teacher to clear their approval queue.</strong> Work still waiting stays
          with the teacher who set it, so a class with anything pending will not move &mdash; the row
          says how many and whose it is.
        </li>
        <li style={{ marginTop: 6 }}>
          <strong>Move each class up.</strong> One row at a time, in any order. The register &mdash;
          early years, younger, older &mdash; is carried across as it is; StoryJar never works it out
          from the year group, so change it on the row if the children have moved between them.
        </li>
        <li style={{ marginTop: 6 }}>
          <strong>Year 6 and anyone else finishing:</strong> use &ldquo;They&rsquo;re leaving&rdquo; on
          the row. Ask their teacher to export the class first if the school wants a copy to hand on
          &mdash; that is the teacher&rsquo;s to do, from My classes &rarr; Export class data.
        </li>
        <li style={{ marginTop: 6 }}>
          <strong>Print the new class codes and put them up.</strong> This is the one job that is still
          yours, and it cannot be avoided: see below.
        </li>
      </ol>

      <h3 style={{ margin: "18px 0 0", font: "700 16px var(--font-atkinson)" }}>Two costs, and one warning</h3>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20, font: "400 16px/1.7 var(--font-atkinson)", color: "#43506B" }}>
        <li style={{ marginTop: 6 }}>
          <strong>Every class gets a new class code, so every child needs telling.</strong> There is no
          way round it. The old code signs somebody in as any child in that class, and a class that has
          changed hands must not keep it.
        </li>
        <li style={{ marginTop: 6 }}>
          <strong>Family codes do not change.</strong> A code belongs to a household rather than to a
          class, so no family letter has to be re-issued and no family loses sight of their child.
          This used to be the slow part of September and it is not any more.
        </li>
        <li style={{ marginTop: 6 }}>
          <strong>Removing a child still really deletes their work.</strong> It takes their moments and
          their photos and drawings with it, and it cannot be undone. It is not, and has never been, a
          way of moving a child somewhere else &mdash; moving them up is. Export first, always.
        </li>
      </ul>

      <p style={{ margin: "14px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        A class that has finished stops appearing in this year&rsquo;s registers, rails and calendars,
        and is listed under &ldquo;Finished classes&rdquo; on the Move-up tab. Everything in it is still
        held, and every child&rsquo;s own page still shows everything they have ever made. How long it
        is kept is on the Promises tab.
      </p>
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
