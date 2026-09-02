import Link from "next/link";

// Shown across the teacher area when a school has asked this teacher to join it
// and the offer is still open.
//
// IT IS A SIGNPOST AND NOTHING ELSE. Nothing is decided here, and there is
// deliberately no "Join" button on it: accepting hands a teacher's classes and
// the children in them to a school, and that decision may only be taken on the
// screen that explains what it means (docs/dpo-decisions.md, 2 September 2026).
// A one-press accept in a banner that follows somebody around every screen is
// the shape that decision exists to rule out.
//
// THE TWO BANNERS CANNOT BOTH RENDER, AND IT IS BY CONSTRUCTION RATHER THAN BY
// A PRECEDENCE RULE — which is why there is no precedence rule to read. Only a
// teacher with no school of their own can hold an open invitation; a teacher
// with no school is governed by their own FREE `Subscription` row; and a FREE
// row is never frozen (RETENTION.md, "Free teacher plan vs school plan": there
// is nothing to pay, so the billing route into FROZEN does not exist for it).
// The layout does not query for an invitation at all once `schoolId` is set,
// so the two conditions cannot be true at the same moment.
export function SchoolInvitationBanner({
  invitationId,
  schoolName,
  invitedByName,
}: {
  invitationId: string;
  schoolName: string;
  invitedByName: string;
}) {
  return (
    <div
      role="status"
      className="sj"
      style={{
        // `--glass`, not `--jam`. The frozen banner is red because something is
        // wrong; this one is an offer, and nothing is wrong. The token is the
        // one globals.css records as darkened so white text on it meets WCAG
        // 2.2 AA 4.5:1 (F11).
        background: "var(--glass, #37796f)",
        color: "var(--paper, #fff)",
        padding: "10px 24px",
        font: "600 15px var(--font-atkinson)",
        textAlign: "center",
      }}
    >
      {invitedByName} has asked you to join <strong>{schoolName}</strong> on StoryJar.{" "}
      {/* 44px, for the same reason FrozenBanner's link is: it is the ONLY
          control on a banner that appears on every screen in the teacher area,
          and it is the one thing the person is here to press. Like that one it
          sits OUTSIDE the shell's `data-shell` regions, so the touch-target
          gate does not reach it and this comment is the guard. */}
      <Link
        href={`/teacher/account/invitation/${invitationId}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 44,
          padding: "0 10px",
          borderRadius: 10,
          color: "var(--paper, #fff)",
          textDecoration: "underline",
          fontWeight: 800,
        }}
      >
        See what joining would mean
      </Link>
    </div>
  );
}
