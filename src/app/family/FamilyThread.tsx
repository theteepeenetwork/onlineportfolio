"use client";

import { sendParentMessage } from "@/app/actions/messaging";
import { ThreadPanel } from "@/components/messaging/ThreadPanel";
import type { ThreadView } from "@/lib/messaging/threads";

// A family's conversation with their child's teacher, below the jar.
//
// Rendered only when there is something to show: the school has switched
// messages on, or something has already been said. A family whose school has
// never turned this on sees nothing here at all — not a disabled box, nothing —
// because "messages are off" is not information a parent needs about a jar.
//
// The reader list is shown every time (SAFEGUARDING rule 21): a parent writing
// about their child is entitled to know who reads it. It never says a thread
// was shared, or passed, or why.
export function FamilyThread({ view, unread = 0 }: { view: ThreadView; unread?: number }) {
  const show = view.canSend || view.messages.length > 0 || Boolean(view.cannotSendReason);
  if (!show) return null;

  const readers = view.readers.map((r) => r.name);

  return (
    <section aria-labelledby={`thread-heading-${view.studentId}`} style={{ marginTop: 34 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "0 0 12px" }}>
        <h2 id={`thread-heading-${view.studentId}`} style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>
          Messages with {view.childName}&apos;s teacher
          {unread > 0 && <span style={{ marginLeft: 10, font: "700 13px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", borderRadius: 999, padding: "2px 10px", verticalAlign: "middle" }}>{unread} new</span>}
        </h2>
        {readers.length > 0 && (
          <span style={{ font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            who can see this: {readers.join(", ")}
          </span>
        )}
      </div>
      <div style={{ background: "var(--paper)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "18px 20px" }}>
        <ThreadPanel
          view={view}
          viewer="PARENT"
          send={sendParentMessage}
          emergencyLine={`Messages here aren’t for emergencies. If ${view.childName} is unwell or you need the school now, please phone the school office.`}
          emptyLine={`Nothing here yet. Write to ${view.recipientName} about ${view.childName} — it stays between you and the school.`}
        />
      </div>
    </section>
  );
}
