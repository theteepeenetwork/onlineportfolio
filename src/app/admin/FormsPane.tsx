"use client";

import { useActionState, useState } from "react";
import { sendConsentForm } from "@/app/actions/consent";
import { CONSENT_ANSWER_LABEL, CONSENT_OFFICE_LINE, PACKED_LUNCH_LABEL } from "@/lib/consent";
import type { AdminFormSummary } from "@/lib/consentForms";
import { CARD, type Tab } from "./tabs";

// Permission slips, from the office's side.
//
// The biggest paper-and-phone job in a primary school: thirty slips out, four
// never come back, and somebody rings four houses on the morning of the trip.
//
// WHAT THE OFFICE GETS IS COUNTS, AND WHY. How many have answered in 4B, how
// many said no, how many are still outstanding, and — if the form asked — how
// many packed lunches the caterer needs. WHICH CHILD said what is the class
// teacher's register, because that is the adult who takes them out of the
// building. A school that needs a name asks the teacher, exactly as it did with
// paper. This is not a limitation dressed up: it is the same line rule 5 draws
// everywhere else on this console, held at the one place it would be easiest to
// let go.
//
// THE SCHOOL WRITES THE QUESTION AND NEVER AN ANSWER. There is no control on
// this screen for adding an option, and the builder says why, because a school
// that wanted one should find the reason rather than a missing feature.

const INPUT: React.CSSProperties = {
  boxSizing: "border-box",
  font: "400 16px var(--font-atkinson)",
  padding: "9px 11px",
  border: "3px solid #22304A",
  borderRadius: 10,
  background: "#FAF6EE",
  color: "#22304A",
};

const JAM_BTN: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "#FAF6EE",
  background: "#C2476B",
  border: "none",
  borderRadius: 999,
  padding: "12px 24px",
  cursor: "pointer",
  boxShadow: "0 3px 0 #93304F",
  minHeight: 44,
};

const QUIET_BTN: React.CSSProperties = {
  font: "700 14px var(--font-atkinson)",
  color: "#22304A",
  background: "#FFFDF7",
  border: "2px solid #22304A",
  borderRadius: 999,
  padding: "8px 16px",
  cursor: "pointer",
  minHeight: 44,
};

const NOTE: React.CSSProperties = { margin: "8px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" };

export type FormsPaneProps = {
  onSchoolPlan: boolean;
  classes: Array<{ id: string; name: string }>;
  /** One line per class per form. Counts only — never a child. */
  sent: AdminFormSummary[];
};

export function FormsPane({ forms: pane, onGoTo }: { forms: FormsPaneProps; onGoTo: (t: Tab) => void }) {
  const [state, action, pending] = useActionState(sendConsentForm, {});
  const [open, setOpen] = useState(false);
  // Controlled, so a refusal does not throw away a paragraph somebody has just
  // written, and this is the longest thing anybody types on this console.
  // React 19 resets a form after its action and puts back controlled text but NOT
  // controlled checkboxes or radios, so the form cancels that reset (`onReset`):
  // found on 10 September 2026 when the evenings form came back from a refusal
  // with every class unticked while its preview line still counted them. The
  // parents' evening spec asserts the ticks survive.
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [lunch, setLunch] = useState(false);
  const [closes, setCloses] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  if (!pane.onSchoolPlan) {
    return (
      <div style={{ ...CARD, marginTop: 24, padding: "24px 26px" }}>
        <h2 style={{ margin: 0, font: "600 22px var(--font-fredoka)" }}>Permission slips are part of the school plan</h2>
        <p style={{ margin: "10px 0 0", font: "400 16px/1.6 var(--font-atkinson)", color: "#43506B", maxWidth: 680 }}>
          A school sends a slip to whole classes and the office watches the answers come back. A teacher on their own
          plan has one class and no office to chase for them.
        </p>
        <button onClick={() => onGoTo("billing")} style={{ ...JAM_BTN, marginTop: 18 }}>See the school plan →</button>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <p style={{ margin: "18px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)", maxWidth: 720 }}>
        Send a permission slip to whole classes and watch the answers come back. Families answer in their own family
        space — there is nothing to print, and no code to re-issue.
      </p>

      <div style={{ ...CARD, marginTop: 20, padding: "18px 22px" }}>
        <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>What you can and cannot ask</h2>
        <p style={{ ...NOTE, marginTop: 10 }}>
          You write the question. <strong>StoryJar writes the answers</strong>, and there are only ever two:
          &ldquo;{CONSENT_ANSWER_LABEL.GIVEN}&rdquo; and &ldquo;{CONSENT_ANSWER_LABEL.NOT_GIVEN}&rdquo;. There is no box
          for a parent to type in.
        </p>
        <p style={NOTE}>
          That is deliberate and it is not going to change. A form that let a school write its own options would, sooner
          or later, ask about an allergy or a medical need — and that is health information about a child, which
          StoryJar does not collect, keep or want. Your office already holds it, and that is where it belongs. Every
          form says so to the family in these words: &ldquo;{CONSENT_OFFICE_LINE}&rdquo;
        </p>
        <p style={NOTE}>
          The one extra thing you can ask is <strong>&ldquo;{PACKED_LUNCH_LABEL}&rdquo;</strong> — a headcount for the
          kitchen on a trip day, for children who have their lunch at school. Switch it on per form.
        </p>
      </div>

      {!open ? (
        <button onClick={() => setOpen(true)} style={{ ...JAM_BTN, marginTop: 18 }}>Send a permission slip</button>
      ) : (
        <form action={action} onReset={(e) => e.preventDefault()} style={{ ...CARD, marginTop: 18, padding: "18px 22px" }}>
          <label style={{ display: "block", font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
            What is it called?
            <input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="e.g. Trip to the Sea Life Centre, 14 October"
              style={{ ...INPUT, display: "block", marginTop: 6, width: "min(520px, 100%)" }}
            />
          </label>
          <label style={{ display: "block", marginTop: 14, font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
            What are you asking permission for?
            <textarea
              name="formBody"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Where the class is going, when, how they are travelling, and what you need permission for."
              style={{ ...INPUT, display: "block", marginTop: 6, width: "min(680px, 100%)" }}
            />
          </label>
          <p style={NOTE}>Families read this exactly as you write it. Don&rsquo;t name a child in it — a form goes to a whole class.</p>

          <fieldset style={{ border: "none", margin: "16px 0 0", padding: 0 }}>
            <legend style={{ font: "700 14px var(--font-atkinson)", color: "#22304A", padding: 0 }}>Which classes?</legend>
            {pane.classes.length === 0 ? (
              <p style={NOTE}>
                No classes yet. They appear here once staff have set them up on the{" "}
                <button type="button" onClick={() => onGoTo("classes")} style={{ font: "inherit", color: "#22304A", background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer" }}>
                  Classes
                </button>{" "}
                tab.
              </p>
            ) : (
              pane.classes.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 44, font: "400 16px var(--font-atkinson)", color: "#22304A", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    name="classIds"
                    value={c.id}
                    checked={picked.includes(c.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                    style={{ width: 22, height: 22 }}
                  />
                  {c.name}
                </label>
              ))
            )}
          </fieldset>

          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, minHeight: 44, font: "400 16px var(--font-atkinson)", color: "#22304A", cursor: "pointer" }}>
            <input type="checkbox" name="asksPackedLunch" checked={lunch} onChange={(e) => setLunch(e.target.checked)} style={{ width: 22, height: 22 }} />
            Also ask &ldquo;{PACKED_LUNCH_LABEL}&rdquo;
          </label>

          <label style={{ display: "block", marginTop: 14, font: "700 14px var(--font-atkinson)", color: "#22304A" }}>
            Answer by (optional)
            <input type="date" name="closesAt" value={closes} onChange={(e) => setCloses(e.target.value)} style={{ ...INPUT, display: "block", marginTop: 6, width: 200 }} />
          </label>
          <p style={NOTE}>A late answer still counts — this is what families are asked to aim for, not a shutter.</p>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button type="submit" disabled={pending} style={JAM_BTN}>{pending ? "Sending…" : "Send it"}</button>
            <button type="button" onClick={() => setOpen(false)} style={QUIET_BTN}>Cancel</button>
          </div>
          {state?.error && (
            <p role="alert" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#C2476B", background: "#F7E0E6", borderRadius: 10, padding: "10px 14px" }}>{state.error}</p>
          )}
          {state?.done && (
            <p role="status" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#2E6B64", background: "#D8ECE8", borderRadius: 10, padding: "10px 14px" }}>{state.done}</p>
          )}
        </form>
      )}

      {pane.sent.map((f) => (
        <div key={f.id} style={{ ...CARD, marginTop: 18, padding: "18px 22px" }}>
          <h2 style={{ margin: 0, font: "600 18px var(--font-fredoka)" }}>{f.title}</h2>
          <p style={NOTE}>
            Sent by {f.sentBy} on {f.sentOn}
            {f.closesOn ? ` · answers asked for by ${f.closesOn}` : ""}
          </p>
          {f.classes.map((c) => (
            <p key={c.name} style={{ margin: "10px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B" }}>
              <strong>{c.name}</strong> — {c.counts.given} gave permission, {c.counts.notGiven} did not,{" "}
              {c.counts.waiting === 0 ? "everyone has answered" : `${c.counts.waiting} still to answer`}
              {f.asksPackedLunch ? ` · ${c.counts.packedLunch} packed ${c.counts.packedLunch === 1 ? "lunch" : "lunches"} needed` : ""}
            </p>
          ))}
          <p style={NOTE}>
            Which child answered which way is on that class teacher&rsquo;s own screen — they are the ones taking them
            out of the building. Ask them if you need a name.
          </p>
        </div>
      ))}
    </div>
  );
}
