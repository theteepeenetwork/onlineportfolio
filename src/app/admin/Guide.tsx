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
  {
    title: "Change what a colleague can do",
    what: "Moves someone between admin, teacher and teaching assistant.",
    how: "Staff → the ⋯ menu on their row → Edit role. The change is recorded in the audit log with your name against it.",
    goTo: "staff",
  },
  {
    title: "Give a colleague a class",
    what: "Puts a class in someone's hands — their queue, their journals.",
    how: "Staff → the ⋯ menu on their row → Assign classes.",
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
    how: "Audit log. It is written by Storyjar, not by hand, and nobody in the school can edit it.",
    goTo: "audit",
  },
  {
    title: "Check the plan",
    what: "Which plan the school is on and how many staff it covers.",
    how: "Billing. The school plan covers every member of staff — there is nothing to count per seat.",
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
    how: "Open a child from Journals, then Family access. Print the letter and send the code home on paper — Storyjar never asks you for a parent's email or phone number.",
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
];

// The other half of a useful guide: the things people go looking for, that are
// missing on purpose. Each of these is a promise on the Promises tab.
const NOT_POSSIBLE: string[] = [
  "See children's work across the whole school. Even as an admin, you see a child's work only if you teach that class.",
  "Give a child a login, an email address or a password. Children sign in with a class code and their own name.",
  "Store a child's surname, birthday, address or contact details. First names and their work, and that is all.",
  "Take a parent's email or phone number from the school. A parent gives us an address themselves, or we hold none.",
  "Let children message each other. There is no child-to-child contact in Storyjar of any kind.",
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
          exactly the same way as every colleague. This page is a map of both, and of the things Storyjar will not
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

      <div className="sj-card" style={{ ...CARD, padding: "22px 24px" }}>
        <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Things Storyjar will not do</h2>
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
