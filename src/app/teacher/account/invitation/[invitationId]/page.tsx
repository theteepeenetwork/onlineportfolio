import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  INVITATION_REFUSED_MESSAGE,
  schoolInvitationIsOpen,
} from "@/lib/schoolInvitationPolicy";
import { writableSchoolPlanWhere } from "@/lib/billing";
import { box } from "../../panelChrome";
import { InvitationDecision } from "./InvitationDecision";

// ===========================================================================
// "A school has asked you to join it." The screen where that is explained.
//
// THIS PAGE IS THE SAFEGUARDING ARGUMENT IN WORDS, and the words are the
// deliverable rather than the decoration. `docs/dpo-decisions.md` (2 September
// 2026) rules that accepting must be a thing a teacher DOES rather than a thing
// done to her, and that the controller change is stated in plain language
// before any button. A bare "Join" would satisfy the code and not the decision.
//
// So five things are on this screen because they are the five things that are
// true afterwards, and each of them is here because leaving it out would be a
// small lie of omission:
//
//   1. her classes and the children in them become the school's, and the
//      school becomes responsible for that work instead of her;
//   2. if she leaves that school later, they STAY WITH IT. This sentence is
//      RETENTION.md "Free teacher plan vs school plan" in plain words and must
//      not be softened. It is the one a teacher would most like to be untrue;
//   3. what the school's admins can see, and what they cannot — including
//      that an admin can move a class to a different teacher, themselves
//      included. "They would not see the work unless they teach the class" is
//      literally true and materially soft on its own, because
//      `assignClassToStaff` makes teaching the class a thing an admin can
//      arrange in one click. The audit row it writes is named in the same
//      breath, because "recorded" is what makes the first half still mean
//      something;
//   4. her free plan ends and the school's covers her, nothing is charged to
//      her, and NOTHING SHE HAS MADE IS DELETED. That last clause is said out
//      loud because the transaction really does delete a row: her own
//      `Subscription`. A teacher who hears "your plan is deleted" and imagines
//      her classes going with it has understood the sentence and not the fact.
//      IT ALSO SAYS THAT THE SCHOOL'S PLAN CAN PAUSE, and that is the half the
//      screen was missing. RETENTION.md's "Free teacher plan vs school plan"
//      makes it the distinguishing property of the free plan that it has no
//      billing route into FROZEN at all; accepting moves her onto a plan that
//      does, where an unpaid bill makes her account read-only — the children
//      cannot hand work in, she cannot approve what is waiting — and starts a
//      12-month clock towards deletion. Leaving that out made joining look
//      costless, and on a screen whose own reason for existing is that a
//      teacher should not be nudged, an omission in one direction is a nudge;
//   5. what does NOT change, because a screen made only of consequences reads
//      as a warning, and a teacher declining out of vague alarm has been
//      nudged just as surely as one accepting out of eagerness.
//
// AND ONE CONDITION THAT IS ABOUT HER RATHER THAN ABOUT THE SCHOOL. Accepting
// requires a proved email address (owner decision, phase 2's Rule 1 review),
// and if hers is not proved the screen says so in the decision section rather
// than letting her read the whole argument and be refused on the press. It does
// NOT hide the page the way an unverified or frozen school does: those two are
// facts about the school that are not hers to be given by us, this one is a
// fact about her own account that she can fix in the next minute, and she
// should be able to read what accepting means while she waits for the email.
//
// AND HER OWN COUNTS, beside it. "Your classes become the school's" is an
// abstraction until it says Bluebell Class and three children. It is her own
// data shown to her, nobody else's.
// ===========================================================================

// A NAME FOR THE BROWSER TAB, which most screens in the teacher area do not
// have and this one should. Ms Blake's persona run found it unnamed, and this
// is the screen most likely to be left open in a tab while somebody goes and
// asks a colleague what joining a school means. It says nothing about which
// school: a tab title is the one piece of a page that is readable over a
// shoulder in a staffroom.
export const metadata = { title: "An invitation to join a school" };

function roleInWords(role: string): string {
  if (role === "ADMIN") return "an admin";
  if (role === "TA") return "a teaching assistant";
  return "a teacher";
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { invitationId } = await params;

  // LOADED SCOPED BY THE SESSION, never by the posted id alone. A colleague's
  // invitation id pasted into the address bar is not "found and refused" here;
  // `findFirst` with `teacherId` in the WHERE means it is not found at all,
  // which is the same instinct as the queue page one directory over
  // (SAFEGUARDING rules 4 and 8).
  //
  // AND THE SCHOOL'S PLAN MUST STILL BE ABLE TO WRITE, which is the third
  // place this clause is written and the reason all three agree. It is in the
  // WHERE rather than in the condition below, exactly as the banner and the
  // account card have it, so the database does not hand this page a row it may
  // not draw. A school that paid and then lapsed keeps `verifiedAt` and keeps
  // its `kind: "SCHOOL"` row at FROZEN, so it would otherwise be explained in
  // full here, offered a button, and refused on the press. `joinSchoolPlan`
  // settles the plan's effective status and refuses; `writableSchoolPlanWhere`
  // is that settle written as a filter, because a render must not freeze
  // another school's row on a stranger's page view.
  //
  // A row filtered out here falls into the same one sentence as everything
  // else below. That is deliberate: it declines to tell a teacher that a
  // school has stopped paying its bill, which is a fact about the school and
  // not hers to be given by us.
  const invitation = await db.schoolInvitation.findFirst({
    where: {
      id: invitationId,
      teacherId: user.teacher.id,
      school: { subscription: writableSchoolPlanWhere() },
    },
    select: {
      id: true,
      role: true,
      state: true,
      expiresAt: true,
      invitedByName: true,
      school: { select: { name: true, verifiedAt: true } },
    },
  });

  // ONE REFUSAL, AND IT LOOKS THE SAME WHICHEVER THING WAS WRONG. Not found,
  // not this teacher's, already answered, withdrawn, run out of time: all one
  // sentence and nothing else on the screen. Distinguishing them would let a
  // signed-in teacher learn whether an id is real, and worse, whether a named
  // school has an offer out to a named colleague. The school is never named
  // here, because the person reading may never have been invited by anybody.
  //
  // `notFound()` was considered and is wrong: a 404 tells a teacher who
  // followed her own banner two minutes late that StoryJar is broken, and
  // leaves her nowhere to go. The policy module's sentence names the person
  // who can fix it.
  //
  // AN UNVERIFIED SCHOOL IS THE FOURTH THING IN THAT LIST, and it is the one
  // addition to the brief for this screen. `joinSchoolPlan` re-checks
  // `School.verifiedAt` at the moment of accepting, because a school can lose
  // verification in the fourteen days an offer stands and acceptance is the
  // moment children's data changes hands. Without this line the screen would
  // explain the whole controller change, offer a button, and then refuse the
  // press with a sentence saying the invitation is not open — which would not
  // be true. Refusing here keeps the two sides agreeing, and it keeps the
  // sentence honest by never being reached for a reason it does not describe.
  // It also declines to tell a teacher that her school has not paid its bill,
  // which is a fact about the school and not hers to be given by us.
  if (!invitation || !schoolInvitationIsOpen(invitation) || !invitation.school.verifiedAt) {
    return (
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ margin: 0, font: "600 28px var(--font-fredoka)" }}>This invitation</h1>
        <p style={{ margin: "12px 0 0", font: "400 17px var(--font-atkinson)", color: "var(--ink-soft)" }}>
          {INVITATION_REFUSED_MESSAGE}
        </p>
        <p style={{ margin: "20px 0 0" }}>
          <Link href="/teacher/account" style={{ font: "700 16px var(--font-atkinson)", color: "var(--ink)" }}>
            Back to your account
          </Link>
        </p>
      </div>
    );
  }

  const schoolName = invitation.school.name;

  // HER OWN CLASSES AND HER OWN PUPILS, scoped by her own id. `_count` rather
  // than the children themselves: the screen needs to say how many, and a
  // child's name is not needed to say it.
  const classes = await db.class.findMany({
    where: { teacherId: user.teacher.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, _count: { select: { students: true } } },
  });
  const pupils = classes.reduce((n, c) => n + c._count.students, 0);

  // HAS SHE PROVED SHE HOLDS HER OWN ADDRESS? `joinSchoolPlan` refuses while
  // this is null, and the screen has to know so that it can say so BEFORE the
  // button rather than after the press. That is the fault fixed for
  // `verifiedAt` and again for a frozen plan: explaining the whole controller
  // change, offering a button, and only then refusing.
  //
  // BUT NOT BY HIDING THE PAGE, which is what those two do. Their reason is a
  // fact about the SCHOOL that is not hers to be given by us, so the screen
  // says one sentence and nothing else. This one is a fact about HER OWN
  // ACCOUNT and she can fix it in the next minute, so the right screen is the
  // whole explanation — she should be able to read what accepting means while
  // she waits for the email — with the decision section saying plainly what
  // she has to do first.
  //
  // READ FROM THE ROW, not from the session: `getCurrentUser` does not carry
  // `emailConfirmedAt`, and a session minted before she opened the link would
  // be stale in the direction that shows a refusal to somebody who has already
  // complied. The address comes from the same read for the same reason — the
  // action mails whatever the row says, so the screen must name whatever the
  // row says.
  const me = await db.teacher.findUnique({
    where: { id: user.teacher.id },
    select: { email: true, emailConfirmedAt: true },
  });
  // DENY BY DEFAULT (rule 8). An unreadable row is treated as unproved, which
  // matches what `joinSchoolPlan` would do with the press.
  const emailConfirmed = me?.emailConfirmedAt != null;

  return (
    <div style={{ maxWidth: 720, display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, font: "600 32px var(--font-fredoka)" }}>
          {invitation.invitedByName} has asked you to join {schoolName}
        </h1>
        <p style={{ margin: "8px 0 0", font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          You would join as {roleInWords(invitation.role)}. Nothing has happened yet. Please read what
          would change before you decide, because some of it cannot be undone by leaving later.
        </p>
      </div>

      {/* What she would bring with her, in her own numbers. */}
      <section style={box} aria-labelledby="brings-heading">
        <h2 id="brings-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>
          What you would bring with you
        </h2>
        {classes.length === 0 ? (
          <p style={{ margin: "8px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--ink-soft)" }}>
            You have no classes yet, so there is no children&rsquo;s work to move. Everything below
            would apply to any class you make from now on.
          </p>
        ) : (
          <>
            <p style={{ margin: "8px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              {classes.length === 1 ? "Your class" : `Your ${classes.length} classes`}, and the{" "}
              {pupils} {pupils === 1 ? "child" : "children"} in {classes.length === 1 ? "it" : "them"}:
            </p>
            <ul style={{ margin: "8px 0 0", paddingLeft: 22, font: "400 16px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              {classes.map((c) => (
                <li key={c.id} style={{ marginTop: 4 }}>
                  {c.name}, {c._count.students} {c._count.students === 1 ? "child" : "children"}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* THE FIVE THINGS. Each heading is the claim; the sentence under it is
          the whole of that claim, said once, in the words a teacher uses. */}
      <section style={box} aria-labelledby="changes-heading">
        <h2 id="changes-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>
          What joining changes
        </h2>

        <h3 style={SUB}>Your classes become the school&rsquo;s</h3>
        <p style={PARA}>
          Your {classes.length === 1 ? "class" : "classes"} and the children in{" "}
          {classes.length === 1 ? "it" : "them"} become {schoolName}&rsquo;s. From that moment the
          school is responsible for the children&rsquo;s work, in law and in practice, rather than
          you. That is true however the plan is paid for and whoever pays for it.
        </p>

        <h3 style={SUB}>If you leave {schoolName}, the work stays with the school</h3>
        <p style={PARA}>
          If you move to another school later, your classes and the children&rsquo;s work stay with{" "}
          {schoolName}. They do not travel with you and you cannot take them to a new school. This
          is the part worth being sure about, because leaving does not undo it.
        </p>

        <h3 style={SUB}>What {schoolName}&rsquo;s admins would see</h3>
        <p style={PARA}>
          The school&rsquo;s StoryJar admins would see your classes, how many children are in each
          one, and a record of what you do in StoryJar. They would not see the children&rsquo;s work
          itself unless they teach the class. An admin can also move a class to a different
          teacher, including themselves, and StoryJar records it when they do.
        </p>

        <h3 style={SUB}>Your plan</h3>
        <p style={PARA}>
          Your free teacher plan ends and {schoolName}&rsquo;s plan covers you instead. Nothing is
          charged to you, now or later. Nothing you have made is deleted: every class, every child
          and every piece of work stays exactly where it is. From then on the school&rsquo;s plan is
          the one that governs your account, including if the school stops paying for it: a school
          plan that goes unpaid is paused, so everyone can still read and download the work but
          nobody can add to it, and work left in a paused account is deleted after 12 months. Your
          free plan has nothing to pay and never pauses, so this part is a real change.
        </p>

        <h3 style={SUB}>What does not change</h3>
        <p style={PARA}>
          You carry on teaching the same classes in the same way. Your class codes stay the same, so
          there is nothing to tell the children and nothing for them to learn again.
        </p>
      </section>

      <section style={box} aria-labelledby="decide-heading">
        <h2 id="decide-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>
          Your decision
        </h2>
        <p style={{ margin: "8px 0 16px", font: "400 16px var(--font-atkinson)", color: "var(--ink-soft)" }}>
          {invitation.invitedByName} asked on behalf of {schoolName}.
        </p>
        <InvitationDecision
          invitationId={invitation.id}
          schoolName={schoolName}
          emailConfirmed={emailConfirmed}
          email={me?.email ?? user.teacher.email}
        />
      </section>
    </div>
  );
}

const SUB: React.CSSProperties = {
  margin: "16px 0 0",
  font: "600 17px var(--font-fredoka)",
  color: "var(--ink)",
};
const PARA: React.CSSProperties = {
  margin: "4px 0 0",
  font: "400 16px var(--font-atkinson)",
  color: "var(--ink-soft)",
};
