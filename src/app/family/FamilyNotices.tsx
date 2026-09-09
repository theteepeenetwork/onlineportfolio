import { NOTICE_NO_REPLY_LINE } from "@/lib/notices";
import type { FamilyNoticeView } from "@/lib/noticeBoard";

// The notice board, in the family space.
//
// NOT A CLIENT COMPONENT, AND THAT IS THE POINT. There is no `useActionState`
// here because there is no action: a notice has no reply table, so there is
// nothing a form could post to (SAFEGUARDING rule 24). "No way to respond" is
// the absence of a `<form>` in this file, and the spec asserts it on the rendered
// section rather than trusting this comment.
//
// Rendered only when there is something on the board. A family whose school has
// never posted one sees nothing here — not an empty section, nothing — for the
// same reason `FamilyThread` renders nothing when messages are off.
//
// Rendered ONCE, above the child selector, not inside it: a notice is to the
// household, and a parent with two children in the school should read "closed
// on Friday" one time. `noticesForParent` already dedupes across their children.

export function FamilyNotices({ notices }: { notices: FamilyNoticeView[] }) {
  if (notices.length === 0) return null;

  return (
    <section aria-labelledby="notices-heading" style={{ marginTop: 26 }}>
      <h2 id="notices-heading" style={{ margin: 0, font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>
        Notices from school
      </h2>
      {/* The line that is the reason there is nothing to press. Said once, at
          the top, rather than under every notice. */}
      <p style={{ margin: "6px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        {NOTICE_NO_REPLY_LINE}
      </p>
      <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 12 }}>
        {notices.map((n) => (
          <li
            key={n.id}
            style={{ background: "var(--paper)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "16px 20px" }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, font: "600 18px var(--font-fredoka)", color: "var(--ink)" }}>{n.title}</h3>
              <span style={{ font: "700 11px var(--font-atkinson)", color: "#2E6B64", background: "var(--glass-light)", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {n.scope}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              From {n.from} · {n.sentOn}
            </p>
            {/* React escapes this, and a URL in it is a URL to read rather than
                a link to press — rule 15, the treatment a message body gets. */}
            <p style={{ margin: "10px 0 0", font: "400 16px/1.65 var(--font-atkinson)", color: "var(--ink)", whiteSpace: "pre-wrap" }}>
              {n.noticeBody}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
