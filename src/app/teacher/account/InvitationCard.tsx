import Link from "next/link";
import { box } from "./panelChrome";

/**
 * Open invitations, on the teacher's own account page.
 *
 * THERE IS NO ACCEPT BUTTON HERE, AND THERE MUST NEVER BE ONE. Accepting hands
 * a teacher's classes and the children's work in them to a school, permanently
 * as far as she is concerned: the decision is only ever taken on the screen
 * that explains what it means (docs/dpo-decisions.md, 2 September 2026). A
 * one-press accept on a settings page beside the profile form would be that
 * decision taken without the explanation, which is the shape the whole design
 * exists to rule out. There is no decline button either, for the smaller
 * version of the same reason: "no" is easy to press by accident from a list.
 *
 * IT REPEATS THE BANNER ON PURPOSE. The banner is a signpost that follows her
 * around and is easy to dismiss as chrome; this is the place she looks when she
 * has decided to deal with it. A teacher who has more than one offer open can
 * also only see that here, because the banner shows the most recent one.
 */
export function InvitationCard({
  invitations,
}: {
  invitations: { id: string; schoolName: string; invitedByName: string }[];
}) {
  if (invitations.length === 0) return null;

  return (
    <section style={box} aria-labelledby="invitations-heading">
      <h2 id="invitations-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>
        {invitations.length === 1 ? "A school has asked you to join it" : "Schools that have asked you to join"}
      </h2>
      <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        Nothing happens until you say yes. Joining a school changes who is responsible for your
        classes and the children&rsquo;s work in them, so the details are on their own page.
      </p>
      <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
        {invitations.map((inv) => (
          <li key={inv.id} style={{ marginTop: 10 }}>
            <p style={{ margin: 0, font: "400 16px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              <strong>{inv.schoolName}</strong>, asked by {inv.invitedByName}
            </p>
            <Link
              href={`/teacher/account/invitation/${inv.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 44,
                font: "700 16px var(--font-atkinson)",
                color: "var(--ink)",
              }}
            >
              See what joining {inv.schoolName} would mean
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
