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
 */
export function InvitationDecision({
  invitationId,
  schoolName,
}: {
  invitationId: string;
  schoolName: string;
}) {
  const [joinState, joinAction, joinPending] = useActionState(joinSchoolPlan, {});

  return (
    <div>
      {/* The refusal, if the offer closed between this page rendering and the
          button being pressed — the school withdrew it, or it ran out, or it
          was answered in another tab. One sentence for all of them. */}
      {joinState?.error && <Notice tone="warn">{joinState.error}</Notice>}

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
