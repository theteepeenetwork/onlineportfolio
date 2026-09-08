"use client";

import { useActionState } from "react";
import { bookMeetingSlot, cancelMeetingSlot } from "@/app/actions/meetings";
import type { FamilyEvening } from "@/lib/meetingBookings";

// Parents' evening, in the family space.
//
// Rendered only when the school has actually set an evening up. A family whose
// school has never held one sees nothing here at all — not an empty section,
// nothing — for the same reason `FamilyThread` renders nothing when messages
// are off: "there is no parents' evening" is not information a parent needs
// about a jar.
//
// A TAKEN SLOT SAYS TAKEN AND NEVER WHO BY. That is decided on the server —
// `eveningsForParent` reduces the child id to a boolean before it leaves — and
// it matters more than it looks: a bookable list with names on it tells one
// family exactly when another family will be in the building, which is a thing
// separated households have very good reasons to care about.
//
// The times are formatted on the SERVER, by `slotLabel`, which reads the
// wall-clock minute in the school's own zone. Nothing here calls
// `toLocaleDateString` or `toLocaleTimeString`: a 4:20pm slot formatted in the
// browser's zone is wrong for a family abroad and is the hydration failure
// `officeHours.ts` documents.

export function FamilyMeetings({
  childId,
  childName,
  evenings,
}: {
  childId: string;
  childName: string;
  evenings: FamilyEvening[];
}) {
  if (evenings.length === 0) return null;

  return (
    <section aria-labelledby={`meet-heading-${childId}`} style={{ marginTop: 34 }}>
      <h2 id={`meet-heading-${childId}`} style={{ margin: 0, font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>
        Parents&rsquo; evening
      </h2>
      <p style={{ margin: "6px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        Pick a time to see {childName}&rsquo;s teacher. You can change it or give it up any time before the evening.
      </p>
      {evenings.map((e) => (
        <EveningCard key={e.id} evening={e} childId={childId} />
      ))}
    </section>
  );
}

function EveningCard({ evening, childId }: { evening: FamilyEvening; childId: string }) {
  const [state, book, booking] = useActionState(bookMeetingSlot, {});
  const [cancelState, cancel, cancelling] = useActionState(cancelMeetingSlot, {});
  const mine = evening.slots.find((s) => s.mine) ?? null;

  return (
    <div style={{ marginTop: 16, background: "var(--paper)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "18px 20px" }}>
      <h3 style={{ margin: 0, font: "600 18px var(--font-fredoka)", color: "var(--ink)" }}>{evening.title}</h3>
      <p style={{ margin: "4px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        {evening.on} · {evening.className} with {evening.teacherName}
      </p>

      {!evening.open ? (
        <p style={{ margin: "12px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "var(--ink)" }}>
          Booking opens on {evening.opensOn}. The times are below so you can see what there is.
        </p>
      ) : mine ? (
        <p role="status" style={{ margin: "12px 0 0", font: "700 16px var(--font-atkinson)", color: "#2E6B64" }}>
          You have {evening.myTime}. Tap another time to move, or give it up below.
        </p>
      ) : (
        <p style={{ margin: "12px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "var(--ink)" }}>
          Tap a time to book it.
        </p>
      )}

      {/* A list of buttons, not a select: on a phone in a corridor, thirty
          tappable times beat a dropdown, and each one is its own 44px target. */}
      <ul style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0 0", padding: 0 }}>
        {evening.slots.map((s) => (
          <li key={s.id}>
            <form action={book} style={{ margin: 0 }}>
              <input type="hidden" name="slotId" value={s.id} />
              <input type="hidden" name="studentId" value={childId} />
              <button
                type="submit"
                disabled={booking || !evening.open || (s.taken && !s.mine)}
                aria-current={s.mine ? "true" : undefined}
                style={{
                  minHeight: 44,
                  minWidth: 88,
                  font: "700 15px var(--font-atkinson)",
                  color: s.mine ? "var(--paper)" : s.taken ? "var(--sj-muted)" : "var(--ink)",
                  background: s.mine ? "#2E6B64" : s.taken ? "transparent" : "var(--cream)",
                  border: s.mine ? "2px solid #2E6B64" : "2px solid var(--calm-border)",
                  borderRadius: 999,
                  padding: "8px 16px",
                  cursor: !evening.open || (s.taken && !s.mine) ? "not-allowed" : "pointer",
                  textDecoration: s.taken && !s.mine ? "line-through" : "none",
                }}
              >
                {s.at}
                {/* Said in words as well as in styling: a strikethrough is not
                    available to a screen reader, and colour alone never is. */}
                <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
                  {s.mine ? " — your appointment" : s.taken ? " — already taken" : " — free"}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      {mine && (
        <form action={cancel} style={{ marginTop: 14 }}>
          <input type="hidden" name="slotId" value={mine.id} />
          <input type="hidden" name="studentId" value={childId} />
          <button
            type="submit"
            disabled={cancelling}
            style={{ minHeight: 44, font: "700 14px var(--font-atkinson)", color: "var(--ink)", background: "none", border: "2px solid var(--calm-border)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}
          >
            {cancelling ? "Giving it up…" : "Give up my appointment"}
          </button>
        </form>
      )}

      {(state?.error || cancelState?.error) && (
        <p role="alert" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#C2476B" }}>
          {state?.error ?? cancelState?.error}
        </p>
      )}
      {(state?.done || cancelState?.done) && (
        <p role="status" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#2E6B64" }}>
          {state?.done ?? cancelState?.done}
        </p>
      )}
    </div>
  );
}
