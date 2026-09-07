// The handbook's content, split out of the page so the page stays a guard, a
// frame and a list of sections.
//
// WHY THE PROSE LIVES UNDER THE OPS ROOTS AT ALL
//
// Because the person who needs it is signed in here at the moment they need it.
// A policy in a repository is read once, on a good day; a policy on the screen
// where the decision is made is read at the moment the decision is made. The
// blindness gate scans this file exactly as hard as a screen that queries
// something, which is right: prose that names a child-data field is how a field
// name gets normalised into something an operator types.
//
// WHY THERE IS NO WRAPPER COMPONENT
//
// The same reason as src/app/ops/shell.tsx: a wrapper takes a `children` prop,
// and on a Parent `children` is the linked-children relation ruling R11 bans in
// either direction. The gate cannot tell React's prop from Prisma's, and should
// not try. Sections take a `body` prop instead. That is the gate working.

import Link from "next/link";

// ---------------------------------------------------------------------------
// Small building blocks. None of them read anything: this whole file is text.
// ---------------------------------------------------------------------------

export function Section({ id, heading, body }: { id: string; heading: string; body: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="card mt-6 p-6">
      <h2 id={id} className="font-display text-xl" style={{ color: "var(--ink)" }}>
        {heading}
      </h2>
      {body}
    </section>
  );
}

// A procedure is collapsed until somebody opens it. The summary carries the one
// line that decides whether this is the procedure you need, so the closed state
// is still useful; <details> is keyboard-operable without any script.
// The subheadings inside a procedure body are h3, not h4: <summary> is a
// disclosure control and not a heading, so the body sits directly under this
// section's h2. An h4 here would read to somebody navigating by heading level
// as though a section had gone missing — which the a11y spec asserts.
export function Procedure({ title, whenToUse, body }: { title: string; whenToUse: string; body: React.ReactNode }) {
  return (
    <details className="mt-4 rounded-lg border p-4" style={{ borderColor: "var(--calm-border)" }}>
      <summary style={{ color: "var(--ink)", fontWeight: 700, cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
        {title}
      </summary>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>{whenToUse}</p>
      <div className="mt-3">{body}</div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 1. Read this first
// ---------------------------------------------------------------------------

export function ReadFirst() {
  return (
    <div>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        StoryJar holds the work of children aged 3 to 11. Safeguarding outranks speed, convenience,
        a customer&rsquo;s urgency and your own curiosity, every time. Where a choice is unclear, the
        more protective option is the right one, and nobody will ever criticise you for taking it.
      </p>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        In law the <strong>school is the data controller</strong> and <strong>StoryJar is the
        processor</strong>. That sentence decides most arguments: we act on a school&rsquo;s
        instructions, we do not decide for them what happens to their pupils&rsquo; work, and when
        something goes wrong they are the ones who must be told so they can meet their own duties.
      </p>
      <h3 className="mt-5 font-semibold" style={{ color: "var(--ink)" }}>If you are new here</h3>
      <ol className="mt-2 list-decimal ps-5" style={{ color: "var(--ink)" }}>
        <li>Read <strong>SAFEGUARDING.md</strong> end to end. It is short, it is the constitution, and every rule in it is numbered permanently.</li>
        <li>Read <strong>docs/exceptional-access.md</strong>, the break-glass procedure. It is summarised below, but read the original before you ever need it.</li>
        <li>Read <strong>RETENTION.md</strong> if you will answer questions about how long anything is kept.</li>
        <li>Then come back to this page. It is the short version, kept where the work happens.</li>
      </ol>
      <p className="mt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
        This console cannot open a pupil&rsquo;s work, and that is enforced by a build gate rather
        than by good intentions — see &ldquo;What this console may never do&rdquo; below.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. How StoryJar works
// ---------------------------------------------------------------------------

export function HowItWorks() {
  return (
    <div>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        Four people use StoryJar, and each of them sees a different thing. Knowing which one is on
        the phone tells you what they can possibly be looking at.
      </p>

      <h3 className="mt-5 font-semibold" style={{ color: "var(--ink)" }}>A pupil</h3>
      <p className="mt-1" style={{ color: "var(--ink)" }}>
        Has no account: no login, no email address, no password. They type the class code their
        teacher shows them, tap their own first name, and make something — a photo, a drawing, their
        own writing, or a short voice note. It goes nowhere until an adult has seen it. A class can
        optionally add a short PIN, which a teacher switches on for the class; it is not an account
        and it is never shown to us.
      </p>

      <h3 className="mt-5 font-semibold" style={{ color: "var(--ink)" }}>A teacher</h3>
      <p className="mt-1" style={{ color: "var(--ink)" }}>
        Runs the queue: everything a pupil makes waits there, and the teacher approves it into that
        pupil&rsquo;s jar or sends it back with a kind note. They also build activities, make classes,
        set the age group (EYFS, KS1 or KS2) that decides the wording and type size a pupil sees, and
        export a class when they need a copy. A teacher sees only their own classes.
      </p>

      <h3 className="mt-5 font-semibold" style={{ color: "var(--ink)" }}>A parent or carer</h3>
      <p className="mt-1" style={{ color: "var(--ink)" }}>
        Gets a family code on paper, sent home by the teacher. It opens a read-only view of their own
        child&rsquo;s approved work, and nothing else. We never take a parent&rsquo;s email address
        or phone number from a school: the parent adds one themselves or we hold none, and we send
        them only a sign-in link they asked for or notices they switched on (rule 6a).
      </p>

      <h3 className="mt-5 font-semibold" style={{ color: "var(--ink)" }}>A school admin</h3>
      <p className="mt-1" style={{ color: "var(--ink)" }}>
        Invites staff, sets roles, assigns classes, reads their school&rsquo;s own audit log and
        manages the plan. An admin does <strong>not</strong> see a pupil&rsquo;s work unless they
        personally teach that class (rule 5). They have their own guide inside their console.
      </p>

      <h3 className="mt-5 font-semibold" style={{ color: "var(--ink)" }}>What a school pays</h3>
      <ul className="mt-2 list-disc ps-5" style={{ color: "var(--ink)" }}>
        <li>A single teacher can stay on the free plan permanently. It has no clock and cannot lapse.</li>
        <li>A school buys the school plan, which covers every member of staff. There is no trial: a school that changes its mind can ask for a full refund within 42 days of the start of the paid year.</li>
        <li>A lapsed school goes <strong>frozen</strong>: no new uploads, everything still readable and downloadable, and warnings before anything is ever deleted. Lapsed payment never causes silent deletion.</li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. What each screen here does
// ---------------------------------------------------------------------------

export function Screens({ idleMinutes }: { idleMinutes: number }) {
  return (
    <div>
      <ul className="mt-3 list-disc ps-5" style={{ color: "var(--ink)" }}>
        <li><strong>Today</strong> — the way in, and the index of what there is.</li>
        <li><strong>Schools</strong> — every registered school, what it pays, its price band, and how many pupils are on roll. Whole-school totals only.</li>
        <li><strong>Billing</strong> — what each school is on and what it owes, with anything unpaid or lapsed first. It changes nothing: Stripe is where a payment is recorded, and this screen links out to it.</li>
        <li><strong>Mail</strong> — whether our email is arriving. Delivery states are written in words, never in colour alone.</li>
        <li><strong>Find an adult</strong> — looks up one member of staff or one parent by their exact email address. It asks you why, and records that you looked.</li>
        <li><strong>Health</strong> — whether the service, the database and the media volume are alive.</li>
        <li><strong>Handbook</strong> — this page.</li>
      </ul>
      <h3 className="mt-5 font-semibold" style={{ color: "var(--ink)" }}>Signing in</h3>
      <p className="mt-1" style={{ color: "var(--ink)" }}>
        A password and a six-digit code from your authenticator, every time. There is no way round
        the second step and no bypass in any environment. You are signed out after {idleMinutes}{" "}
        minutes of not using the console, and after eight hours whatever happens. Nothing here holds
        unsaved work, so being signed out costs you nothing but the walk back.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. What this console may never do
// ---------------------------------------------------------------------------

export function NeverDo() {
  return (
    <div>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        Rule 20: the person who operates StoryJar can run the service and <strong>cannot read a
        pupil&rsquo;s work through it</strong>. This console may read adult records, billing, and
        counts large enough that no individual shows through. It may never show a pupil&rsquo;s name,
        their work, the words they wrote, a file they made, a quiz answer, a class code, a family
        code or a PIN, never produce a figure about one pupil, and never sign in as another person.
      </p>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        This is not a convention. <code>scripts/check-ops-blindness.mjs</code> runs on every build,
        and an operator screen that reaches for any of it fails the build before review. A code
        rotation never needs to display a code: you trigger the rotation and the teacher sees the new
        one in their own interface.
      </p>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        <strong>If you genuinely need something this refuses, the answer is never to relax the
        gate.</strong> It is a new named, audited, aggregate-only operation, added deliberately, with
        a test proving the thing it still refuses. Weakening the gate is the failure, not the
        workaround.
      </p>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        Every adult lookup you run is recorded with your reason, in this area&rsquo;s own audit
        trail. That is there to protect the people whose records you opened, and to protect you.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Procedures
// ---------------------------------------------------------------------------

export function BreakGlassBody() {
  return (
    <div style={{ color: "var(--ink)" }}>
      <p>
        Rule 20 stops this console reading a pupil&rsquo;s work. It does not change the fact that
        whoever holds the hosting account can reach the database file and the media volume directly.
        Undefined access is worse than governed access, so that route has rules, and these are they.
        The full text is <strong>docs/exceptional-access.md</strong>.
      </p>
      <h3 className="mt-4 font-semibold">The only circumstances that permit it</h3>
      <ol className="mt-2 list-decimal ps-5">
        <li>A court order, a police request, or a regulator using a statutory power. Verify it is genuine, and speak to a solicitor before disclosing anything.</li>
        <li>The school, as controller, instructs it in writing — a subject access request, or a restore they asked for.</li>
        <li>Reported illegal content, in particular child sexual abuse material. <strong>Do not open it.</strong> Preserve it, do not browse, and report to the police and the Internet Watch Foundation. Viewing suspected material to &ldquo;check&rdquo; is hazardous and is not required of you.</li>
        <li>A safeguarding concern where the school itself, or one of its staff, is the subject — because every other route in this product ends at the school.</li>
        <li>Data loss or corruption where recovery cannot be done blind.</li>
      </ol>
      <h3 className="mt-4 font-semibold">Never a trigger</h3>
      <p className="mt-1">
        Curiosity. Debugging that could be done on made-up data. Checking whether a feature looks
        right. A teacher or a parent asking informally. Wanting to know if a bug report is real.
        Marketing, screenshots, demos or testimonials. If the reason is not on the list above, the
        answer is no.
      </p>
      <h3 className="mt-4 font-semibold">Notify before you look, never afterwards</h3>
      <p className="mt-1">
        Write down first: the date and time, which circumstance applies, what you are looking for,
        and the narrowest thing that answers it. If you cannot name the narrowest thing, you are not
        ready to look. Then send the notice — <em>before</em> opening anything. Normally to the
        school. Where the circumstance forbids that (an order that says so, or a concern about the
        school itself) it goes to the police, or to the local authority&rsquo;s designated officer.
      </p>
      <p className="mt-2">
        The timing is the whole control. Telling somebody afterwards leaves you free to decide, once
        you have seen what you found, whether to tell them at all. An email already sitting in a
        school&rsquo;s inbox cannot be edited or backdated by the person who sent it — which is the
        one property no audit log on our own infrastructure can give, because we hold that too.
      </p>
      <h3 className="mt-4 font-semibold">While you are in, and after</h3>
      <p className="mt-1">
        One pupil&rsquo;s record, not a table. One file, not a folder. No copies, no screenshots.
        Stop the moment the question is answered. Then, the same day, record what was actually opened
        and found, and tell the same people. Recovery of a broken service is the only case where the
        notice may follow instead of precede, and then within one working day.
      </p>
    </div>
  );
}

export function IncidentBody() {
  return (
    <ol className="list-decimal ps-5" style={{ color: "var(--ink)" }}>
      <li><strong>Contain</strong> — stop the exposure: revoke, take offline, rotate keys.</li>
      <li><strong>Assess</strong> — what data, whose, how much; whether it is a personal-data breach, a safeguarding incident, or both.</li>
      <li><strong>Notify</strong> — tell the affected school without undue delay. They are the controller and the 72-hour duty to the ICO is theirs, so they need what happened, whose data, and what we have done. Do not wait until you have a complete picture; say what is known and follow up.</li>
      <li><strong>Record</strong> — the incident, the decisions and the timeline.</li>
      <li><strong>Remediate</strong> — fix the cause, then add a rule or a test so it cannot recur. A fix without a test is a fix that comes back.</li>
    </ol>
  );
}

export function RequestsBody() {
  return (
    <div style={{ color: "var(--ink)" }}>
      <p>
        A parent&rsquo;s request goes to their school, not to us: the school is the controller. Most
        of it the school can answer alone — a teacher can export a class and can delete a moment, a
        pupil or a class outright.
      </p>
      <p className="mt-2">
        When a school instructs us in writing, that is circumstance 2 of break glass. Same procedure:
        confirm the scope back to them before you open anything, do the narrowest thing that answers
        it, and record it. Deletion means the rows <em>and</em> the files, never just the way to
        reach them.
      </p>
    </div>
  );
}

export function RetentionBody() {
  return (
    <ul className="list-disc ps-5" style={{ color: "var(--ink)" }}>
      <li>A frozen school keeps everything for <strong>12 months</strong> from the lapse, with warnings, then it is deleted — rows and files.</li>
      <li>Work sent back to a pupil and left unfinished, and in-progress drafts, go within <strong>30 days</strong>.</li>
      <li>Deleting a pupil, class or school removes their records and their photos, drawings and voice notes together.</li>
      <li>A family&rsquo;s space disappears when the last pupil it was linked to goes, along with its codes and sessions.</li>
      <li>The full schedule is <strong>RETENTION.md</strong>, and it is part of the constitution: a change that keeps data longer, or a new kind of data with no entry, does not ship.</li>
    </ul>
  );
}

export function ConcernBody() {
  return (
    <ul className="list-disc ps-5" style={{ color: "var(--ink)" }}>
      <li><strong>A concern about a child, raised by a school</strong> — their Designated Safeguarding Lead, always. StoryJar is not a reporting route and never replaces a school&rsquo;s own procedures.</li>
      <li><strong>A child at immediate risk</strong> — the police, or the local authority&rsquo;s children&rsquo;s services.</li>
      <li><strong>A concern about a school itself, or one of its staff</strong> — the local authority&rsquo;s designated officer. This is circumstance 4 of break glass, and the one case where we act outside the school. Do not tell the person concerned, and do not tell the school if it would prejudice the matter.</li>
      <li><strong>Something wrong with how StoryJar handles work or data</strong> — that is ours. Follow the incident procedure above.</li>
    </ul>
  );
}

export function Documents() {
  return (
    <div>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        This page is the short version. These are the originals, and they are what counts:
      </p>
      <ul className="mt-2 list-disc ps-5" style={{ color: "var(--ink)" }}>
        <li><strong>SAFEGUARDING.md</strong> — the numbered rules everything else answers to.</li>
        <li><strong>RETENTION.md</strong> — how long every kind of data lives.</li>
        <li><strong>docs/exceptional-access.md</strong> — break glass, in full.</li>
        <li><strong>docs/DPIA.md</strong> — the data protection impact assessment.</li>
        <li><strong>TEST_PLAN.md</strong> and <strong>FINDINGS.md</strong> — what is tested, and the gaps we know about and have written down.</li>
      </ul>
      <p className="mt-3" style={{ color: "var(--ink)" }}>
        What a school or a parent sees is published:{" "}
        <Link href="/legal/safeguarding" style={{ color: "var(--ink)", textDecoration: "underline" }}>safeguarding</Link>,{" "}
        <Link href="/legal/privacy" style={{ color: "var(--ink)", textDecoration: "underline" }}>privacy</Link>,{" "}
        <Link href="/legal/data-processing" style={{ color: "var(--ink)", textDecoration: "underline" }}>data processing terms</Link>, and{" "}
        <Link href="/legal/sub-processors" style={{ color: "var(--ink)", textDecoration: "underline" }}>sub-processors</Link>.
      </p>
    </div>
  );
}
