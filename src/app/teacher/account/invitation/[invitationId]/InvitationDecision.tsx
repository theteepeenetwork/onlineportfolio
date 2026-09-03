"use client";

import { useActionState } from "react";
import { joinSchoolPlan } from "@/app/actions/billing";
import { declineSchoolInvitation } from "@/app/actions/schoolInvitation";
import { Notice } from "../../panelChrome";

/**
 * The two buttons, and nothing else.
 *
 * THEY ARE THE SAME SIZE, THE SAME SHAPE AND THE SAME WEIGHT, AND THAT IS A
 * SAFEGUARDING DECISION RATHER THAN A DESIGN ONE. Everywhere else in this
 * product the action we want is a filled jam-red button and the way out is a
 * quiet outline, which is right when the choice is "save this" or "go back".
 * It is wrong here. This is an adult deciding whether a school becomes
 * responsible for a class of children's work, and the Children's Code's line
 * on nudge techniques applies to the adult making that decision as squarely as
 * to a child making one. So neither button is styled to be pressed: same
 * padding, same radius, same border, same font, the same 44px floor, and the
 * only difference between them is the words.
 *
 * TWO FORMS RATHER THAN ONE WITH TWO `formAction`s, deliberately. They post to
 * different actions with different return shapes — one returns a refusal
 * sentence to render, the other redirects — and a single form would put a
 * pending state on both buttons whichever was pressed, which reads as though
 * both are happening.
 *
 * AND STILL TWO WHEN HER ADDRESS IS NOT PROVED YET. `joinSchoolPlan` refuses
 * while `Teacher.emailConfirmedAt` is null (owner decision, phase 2's Rule 1
 * review) and sends her a confirmation link as it refuses, so what changes here
 * is a paragraph ABOVE the buttons and not the buttons themselves.
 *
 * A THIRD BUTTON — "Email me a confirmation link", posting an action that only
 * ever sends — was written and thrown away, for two reasons. The smaller one is
 * that it would be a new authenticated mail-sending action for a job an
 * existing one already does. The larger is the paragraph above this one: the
 * whole design of this component is a PAIR, matched in size, shape and weight,
 * because the Children's Code's line on nudging applies to the adult deciding
 * whether a school becomes responsible for a class of children's work. A third
 * button changes the weight of that pair, on the one screen in the product
 * where the balance is the feature.
 *
 * SO THE TEACHER IS TOLD BEFORE SHE PRESSES, WHICH IS THE ACTUAL FIX. The fault
 * worth avoiding is not "the button is here", it is "the whole argument, then a
 * button, then a refusal nobody warned you about" — the same fault fixed for an
 * unverified school and again for a frozen plan. Saying it first makes the
 * button honest in both states: press it unproved and a link is emailed, press
 * it once the link is open and it joins the school, which is what it says on it.
 */
export function InvitationDecision({
  invitationId,
  schoolName,
  emailConfirmed,
  email,
}: {
  invitationId: string;
  schoolName: string;
  emailConfirmed: boolean;
  email: string;
}) {
  const [joinState, joinAction, joinPending] = useActionState(joinSchoolPlan, {});

  return (
    <div>
      {/* The refusal, if the offer closed between this page rendering and the
          button being pressed — the school withdrew it, or it ran out, or it
          was answered in another tab. One sentence for all of them. */}
      {joinState?.error && <Notice tone="warn">{joinState.error}</Notice>}

      {/* NOT A `Notice`, on purpose: that is a `role="status"` live region for
          news about something that just happened, and this is a standing
          condition of the screen. It is here at first paint, so announcing it
          as an update would be wrong twice — a screen reader meets it in
          reading order like any other paragraph.

          IT NAMES THE ADDRESS. A teacher who mistyped her address at signup has
          had no reason to find out until now; this is the moment it costs her
          something, so it is the moment to show her what we hold. */}
      {!emailConfirmed && (
        <div style={UNPROVED}>
          <h3 style={{ margin: 0, font: "600 17px var(--font-fredoka)" }}>
            Confirm your email address first
          </h3>
          <p style={{ margin: "6px 0 0", font: "400 16px var(--font-atkinson)" }}>
            Before you can join a school, we need to know we can reach you at <strong>{email}</strong>.
            Press &ldquo;Join {schoolName}&rdquo; and we will email you a link. You will not join{" "}
            {schoolName} until you have opened that link and pressed the button again — so nothing
            below happens yet.
          </p>
          <p style={{ margin: "6px 0 0", font: "400 16px var(--font-atkinson)" }}>
            If that address is wrong, change it on your account page first, and we will send the
            link to the new one.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <form action={joinAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <button type="submit" disabled={joinPending} style={BUTTON}>
            {joinPending ? "Joining…" : `Join ${schoolName}`}
          </button>
        </form>

        <form action={declineSchoolInvitation}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <button type="submit" style={BUTTON}>
            No thank you
          </button>
        </form>
      </div>

      <p style={{ margin: "12px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        Saying no changes nothing. You keep your classes and your free plan, and the school can ask
        you again.
      </p>
    </div>
  );
}

// The standing note for a teacher whose address is not proved yet. Quiet
// enough not to read as an error — she has done nothing wrong — and separated
// from the buttons so it is plainly about the screen rather than about the
// press that has not happened.
const UNPROVED: React.CSSProperties = {
  background: "#eef4f8",
  color: "#2b5c74",
  borderRadius: 16,
  padding: "14px 16px",
  margin: "0 0 16px",
};

// One style object, used by both buttons, so they cannot drift apart in a later
// edit. 44px is the WCAG 2.2 AA target floor and this is a decision screen, so
// there is comfortably more.
const BUTTON: React.CSSProperties = {
  font: "700 16px var(--font-atkinson)",
  color: "var(--ink)",
  background: "var(--cream)",
  border: "3px solid var(--ink)",
  borderRadius: 999,
  padding: "12px 24px",
  minHeight: 48,
  cursor: "pointer",
};
