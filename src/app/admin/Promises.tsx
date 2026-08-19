import Link from "next/link";
import { CARD } from "./tabs";

// The reference pane: what StoryJar promises about children's work, and the
// procedures that say what happens when something goes wrong or when somebody
// has to step outside the ordinary path.
//
// This is a plain-English rendering of the rules StoryJar is built to
// (SAFEGUARDING.md), the retention schedule (RETENTION.md) and the exceptional
// access procedure (docs/exceptional-access.md). It is static text: it states
// what is true for every school, and reads nothing about this one.
//
// Rule numbers are permanent identifiers and are printed on purpose. A school
// asking "which rule is that?" during a DPIA or a procurement check should be
// able to quote a number back at us.

type Promise_ = { rule: string; title: string; body: string };
type Group = { heading: string; promises: Promise_[] };

const GROUPS: Group[] = [
  {
    heading: "Children are never made into account-holders",
    promises: [
      {
        rule: "Rule 1",
        title: "No pupil logins, emails or passwords — ever",
        body: "A pupil signs in with their class code and by tapping their own name. There is no account to be phished, no password to be shared and no address for anyone to reach them at.",
      },
      {
        rule: "Rule 2",
        title: "First names only",
        body: "StoryJar stores a pupil's first name and their work. No surnames, birthdays, addresses, contact details or photographs of identity documents.",
      },
    ],
  },
  {
    heading: "Nothing is seen until an adult has seen it",
    promises: [
      {
        rule: "Rule 3",
        title: "The approval queue is sacred",
        body: "Everything a pupil makes waits in their teacher's queue. Until a teacher approves it, nobody else can see it — not the family, not another child, not another member of staff.",
      },
    ],
  },
  {
    heading: "A pupil's work is private, and tightly scoped",
    promises: [
      {
        rule: "Rule 4",
        title: "Access is need-to-know, and checked on our servers",
        body: "A pupil's moment is visible to the staff who teach that class and to their linked parent or carer, read-only, once approved. Every request is checked against who is asking — never against what their screen claims.",
      },
      {
        rule: "Rule 5",
        title: "Admins are not all-seeing",
        body: "As an admin you manage staff, classes and the plan. You do not see a pupil's work unless you personally teach that class. There is no school-wide view of children's work, for anyone.",
      },
      {
        rule: "Rule 20",
        title: "Neither is StoryJar's operator",
        body: "The person who runs StoryJar cannot read a child's work through it. Their console can reach adult records, billing and counts too large for an individual to show through — never a child's name, work, caption, media, draft, quiz answer, class code or PIN, and never a way to sign in as somebody else. This is checked automatically before any change to that console can be released; a change that reached for a child's data would fail the build.",
      },
      {
        rule: "Rule 6",
        title: "Parents see only their own children, read-only",
        body: "No family can see another family's child. Parents can look and download; only a teacher can add, change or remove what is in a jar.",
      },
      {
        rule: "Rule 6a",
        title: "A parent's contact details come only from that parent",
        body: "StoryJar never takes a parent's email or phone number from a teacher, a school import or a child. Family access goes home on paper as a code, and the parent decides whether to add an address at all. We send them a sign-in link they asked for, or notices they switched on themselves. Nothing else, and nothing by default.",
      },
      {
        rule: "Rule 7",
        title: "Photos and drawings are access-controlled, not public",
        body: "Uploaded media never sits at a guessable or open web address. Every request for a file is authorised against the same rules as the work it belongs to before a single byte is sent.",
      },
    ],
  },
  {
    heading: "Fail safe",
    promises: [
      {
        rule: "Rule 8",
        title: "Deny by default",
        body: "Where there is any doubt about who is asking or what they may see, StoryJar refuses and returns nothing. An error never leaks somebody else's data.",
      },
      {
        rule: "Rule 9",
        title: "Deletion is real, and retention is bounded",
        body: "When a school, class, pupil or moment is deleted, the records and the underlying files go — not just the way to reach them. How long everything lives is set out in a published schedule, and a lapsed payment never causes silent deletion.",
      },
    ],
  },
  {
    heading: "Data stays where we promised",
    promises: [
      {
        rule: "Rule 10",
        title: "UK/EU only",
        body: "Every piece of personal data — the database, uploaded media and backups — is stored and processed in the UK or the EU. StoryJar's data is held in Amsterdam.",
      },
      {
        rule: "Rule 11",
        title: "Every third party is named",
        body: "Each company involved in running StoryJar is listed publicly with what it does and where it holds data. No tracking, no profiling, no advertising, and children's data is never used to train anything.",
      },
    ],
  },
  {
    heading: "Accountability, and access for every child",
    promises: [
      {
        rule: "Rule 16",
        title: "Safeguarding actions are recorded",
        body: "Who approved, returned or deleted a moment, and every staff and role change, is written to the audit log with a name and a time. You can read your school's on the Audit log tab.",
      },
      {
        rule: "Rule 17",
        title: "Incidents have a plan",
        body: "A suspected data breach is reported to your school without undue delay, so you can meet your own 72-hour duty to the ICO. A concern about a child goes to your Designated Safeguarding Lead.",
      },
      {
        rule: "Rule 18",
        title: "Accessibility is part of safety",
        body: "WCAG 2.2 AA, dyslexia-friendly type, large touch targets for small hands, and reduced motion honoured. A child who cannot use the tool cannot be kept safe by it.",
      },
      {
        rule: "Rule 19",
        title: "A child's face and voice are not identifiers",
        body: "StoryJar never runs face or voice recognition over a child's photo or recording, and never builds a biometric profile from one.",
      },
    ],
  },
];

export function Promises() {
  return (
    <div style={{ marginTop: 24, display: "grid", gap: 26 }}>
      <div className="sj-card" style={{ ...CARD, padding: "22px 24px" }}>
        <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>What this is</h2>
        <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B" }}>
          StoryJar holds the work of children aged 3–11, so it is built to a written set of rules rather than to
          whatever seemed reasonable that week. Below are the promises those rules make to your school, and the
          procedures that say what happens when something goes wrong. Most of them are enforced automatically:
          a change that broke one would fail its tests and never reach you. The rule numbers are permanent — quote
          them at us.
        </p>
        <p style={{ margin: "10px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
          Your school is the data controller. StoryJar is the processor, acting on your instructions.
        </p>
      </div>

      {GROUPS.map((g) => (
        <section key={g.heading} aria-labelledby={slug(g.heading)}>
          <h2 id={slug(g.heading)} style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>{g.heading}</h2>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {g.promises.map((p) => (
              <div key={p.rule} className="sj-card" style={{ ...CARD, display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span style={{ font: "700 12px var(--font-atkinson)", color: "#43506B", background: "#F3E3C3", borderRadius: 999, padding: "5px 11px", whiteSpace: "nowrap", letterSpacing: "0.04em" }}>
                  {p.rule}
                </span>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <h3 style={{ margin: 0, font: "700 16px var(--font-atkinson)" }}>{p.title}</h3>
                  <p style={{ margin: "4px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B" }}>{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="procedures">
        <h2 id="procedures" style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Procedures</h2>
        <p style={{ margin: "4px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          What actually happens, step by step, when the ordinary path is not enough. Open one to read it.
        </p>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <Procedure
            title="Break glass — when StoryJar's operator can reach a child's data outside the app"
            summary="Five circumstances, all of them serious. Somebody outside StoryJar is told before anything is opened."
          >
            <p style={P}>
              Rule 20 says the operator cannot read a child&apos;s work through StoryJar, and that is enforced in the
              code. It does not change the fact that the person who runs the service holds the hosting account, and
              so could reach the database and the stored files directly. Pretending otherwise would be dishonest, so
              that access is governed instead of ignored.
            </p>
            <h4 style={H4}>The only circumstances that permit it</h4>
            <ol style={LIST}>
              <li>A court order, a police request, or a regulator using a statutory power.</li>
              <li>Your school, as the data controller, instructs it in writing — a subject access request, or a restore you have asked for.</li>
              <li>Reported illegal content, in particular child sexual abuse material. The material is preserved and reported to the police and the Internet Watch Foundation, and is not opened.</li>
              <li>A safeguarding concern where the school itself, or a member of its staff, is the subject — because every other route in StoryJar ends at the school.</li>
              <li>Data loss or corruption where recovery cannot be done blind.</li>
            </ol>
            <h4 style={H4}>What is never a trigger</h4>
            <p style={P}>
              Curiosity. Debugging that could be done on made-up data. Checking whether something &ldquo;looks
              right&rdquo;. A teacher or a parent asking informally. Screenshots, demos, marketing or testimonials.
              Improving the product. If the reason is not on the list above, the answer is no.
            </p>
            <h4 style={H4}>You are told before we look, not afterwards</h4>
            <p style={P}>
              The notification goes out <strong>before</strong> anything is opened, saying what is about to be opened
              and why. Normally that is your school. Where the circumstance forbids telling you — a police order that
              says so, or a concern about the school itself — the notice goes to the police or to the local
              authority&apos;s designated officer (LADO) instead. Telling somebody afterwards would leave room to
              decide, once we had seen what we found, whether to tell anyone at all. Telling you first takes that
              choice away from us.
            </p>
            <h4 style={H4}>What is opened, and what is written down</h4>
            <p style={P}>
              One child&apos;s record, not a table. One file, not a folder. No copies, no screenshots, and it stops
              the moment the question is answered. Every occasion records the date and time, which circumstance
              applied, who authorised it, what was opened, why that was the least that would do, who was told and
              when. Recovery of a broken service is the only case where the notice may follow instead of precede,
              and then within one working day.
            </p>
          </Procedure>

          <Procedure
            title="If personal data is exposed"
            summary="We contain it, tell your school without undue delay, and give you what you need for the ICO."
          >
            <ol style={LIST}>
              <li><strong>Contain</strong> — stop the exposure: revoke, take offline, rotate keys.</li>
              <li><strong>Assess</strong> — what data, whose, how much, and whether it is a personal-data breach, a safeguarding incident, or both.</li>
              <li><strong>Notify</strong> — tell your school without undue delay, because you are the controller and the 72-hour duty to the ICO is yours. You get what happened, whose data, and what we have done.</li>
              <li><strong>Record</strong> — the incident, the decisions and the timeline are written down.</li>
              <li><strong>Remediate</strong> — fix the cause, then add a rule or a test so the same thing cannot happen twice.</li>
            </ol>
            <p style={P}>Tell us at <strong>hello@storyjar.co.uk</strong> if you think something has gone wrong. A false alarm costs nothing.</p>
          </Procedure>

          <Procedure
            title="If a parent asks for a copy, or asks you to delete"
            summary="The request is yours to answer as controller; we do the work you instruct."
          >
            <p style={P}>
              A parent&apos;s request comes to the school, not to us — you are the controller. Most of it you can
              answer yourself: <strong>My classes → Export class data</strong> gives you what StoryJar holds for a
              class, and a teacher can delete a moment, a pupil or a class outright.
            </p>
            <p style={P}>
              Where you need more, instruct us in writing and we act on your instruction, which is circumstance 2 in
              the break-glass procedure above and is notified and recorded the same way. Deletion means the records
              and the files, not just the way to reach them.
            </p>
          </Procedure>

          <Procedure
            title="When an account lapses, or a pupil or class is removed"
            summary="Nothing is deleted by surprise. Warnings come first, and the schedule is published."
          >
            <ul style={LIST}>
              <li>A lapsed school subscription becomes <strong>frozen</strong>: no new uploads, but everything stays readable and downloadable.</li>
              <li>A frozen account keeps children&apos;s work for <strong>12 months</strong>, with warnings before anything is deleted. Lapsed payment never causes silent deletion.</li>
              <li>Work sent back to a child and left unfinished is removed within <strong>30 days</strong>, as are unfinished drafts.</li>
              <li>Deleting a pupil, a class or a school removes their records <strong>and</strong> their photos, drawings and voice notes.</li>
              <li>A family&apos;s access disappears when the last child it was linked to goes, along with any codes and sessions attached to it.</li>
              <li>The free teacher plan has no clock and cannot lapse.</li>
            </ul>
          </Procedure>

          <Procedure
            title="Raising a safeguarding concern"
            summary="Your DSL first. If the concern is about the school itself, there is a route that does not go through them."
          >
            <ul style={LIST}>
              <li><strong>A concern about a child</strong> — your school&apos;s Designated Safeguarding Lead, in the first instance. StoryJar is not a reporting route and never replaces your own procedures.</li>
              <li><strong>A child at immediate risk</strong> — the police, or your local authority&apos;s children&apos;s services.</li>
              <li><strong>Something wrong with how StoryJar handles work or data</strong> — <strong>hello@storyjar.co.uk</strong>, and we will work with the school.</li>
              <li><strong>A concern about the school itself, or a member of its staff</strong> — the local authority&apos;s designated officer (LADO). This is circumstance 4 above, and the one case where StoryJar&apos;s operator may act outside the school.</li>
            </ul>
          </Procedure>
        </div>
      </section>

      <div className="sj-card" style={{ ...CARD, padding: "22px 24px" }}>
        <h2 style={{ margin: 0, font: "600 20px var(--font-fredoka)" }}>Where this is written down</h2>
        <p style={{ margin: "10px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B" }}>
          This pane is a summary. The full documents are public, and are the version that counts:
        </p>
        <ul style={{ margin: "10px 0 0", paddingLeft: 20, font: "400 16px/1.8 var(--font-atkinson)", color: "#43506B" }}>
          <li><Link href="/legal/safeguarding" style={A}>Safeguarding &amp; child protection</Link></li>
          <li><Link href="/legal/privacy" style={A}>Privacy notice</Link> · <Link href="/legal/privacy-for-families" style={A}>the version for families</Link></li>
          <li><Link href="/legal/data-processing" style={A}>Data processing terms</Link> — the contract between your school and StoryJar</li>
          <li><Link href="/legal/sub-processors" style={A}>Sub-processors</Link> — every company involved, and where it holds data</li>
          <li><Link href="/legal/accessibility" style={A}>Accessibility statement</Link></li>
        </ul>
        <p style={{ margin: "12px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
          The rules themselves, the retention schedule and the full break-glass procedure are maintained as written
          documents and are available to your school on request — ask at <strong>hello@storyjar.co.uk</strong>.
        </p>
      </div>
    </div>
  );
}

function Procedure({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) {
  return (
    <details className="sj-card" style={{ ...CARD, padding: "14px 18px" }}>
      <summary style={{ cursor: "pointer", font: "700 16px var(--font-atkinson)", color: "#22304A" }}>
        {title}
        <span style={{ display: "block", font: "400 14px/1.5 var(--font-atkinson)", color: "var(--sj-muted)", marginTop: 3 }}>{summary}</span>
      </summary>
      <div style={{ marginTop: 10, borderTop: "1px solid #F0EADD", paddingTop: 12 }}>{children}</div>
    </details>
  );
}

const P: React.CSSProperties = { margin: "0 0 10px", font: "400 15px/1.65 var(--font-atkinson)", color: "#43506B" };
const H4: React.CSSProperties = { margin: "14px 0 6px", font: "700 15px var(--font-atkinson)", color: "#22304A" };
const LIST: React.CSSProperties = { margin: "0 0 10px", paddingLeft: 20, font: "400 15px/1.7 var(--font-atkinson)", color: "#43506B" };
const A: React.CSSProperties = { color: "#C2476B", fontWeight: 700 };

const slug = (s: string) => `promises-${s.replace(/[^a-z]+/gi, "-").toLowerCase()}`;
