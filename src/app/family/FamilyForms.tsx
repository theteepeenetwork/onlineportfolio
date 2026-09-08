"use client";

import { useActionState, useState } from "react";
import { answerConsentForm } from "@/app/actions/consent";
import {
  CONSENT_ANSWERS,
  CONSENT_ANSWER_LABEL,
  CONSENT_OFFICE_LINE,
  PACKED_LUNCH_LABEL,
  type ConsentAnswer,
} from "@/lib/consent";

// Permission slips, in the family space.
//
// Rendered only when there is something to answer or something already
// answered. A family whose school has never sent one sees nothing here at all —
// not an empty section, nothing — for the same reason `FamilyThread` renders
// nothing when messages are off: "there are no forms" is not information a
// parent needs about a jar.
//
// THE ANSWERS ARE STORYJAR'S AND THERE IS NOWHERE TO TYPE. `src/lib/consent.ts`
// owns them and says why (SAFEGUARDING rule 19). What a parent gets is two
// radios, sometimes a checkbox, and a line telling them where anything medical
// or dietary actually goes — because the honest answer is "the school office",
// and a box here would collect it instead.
//
// NEITHER ANSWER IS PRE-SELECTED. A permission form that arrives with "I give
// permission" already chosen is a nudge, and the Children's Code is about
// exactly that; the same reason the age-mode forms pre-select nothing.

export type FamilyFormView = {
  id: string;
  title: string;
  formBody: string;
  asksPackedLunch: boolean;
  /** "Friday 12 September", or null when the school set no closing date. */
  closesOn: string | null;
  /** Their answer so far, if they have given one. Changeable until it closes. */
  answer: ConsentAnswer | null;
  packedLunch: boolean;
};

export function FamilyForms({ childId, childName, forms }: { childId: string; childName: string; forms: FamilyFormView[] }) {
  if (forms.length === 0) return null;
  const waiting = forms.filter((f) => f.answer === null).length;

  return (
    <section aria-labelledby={`forms-heading-${childId}`} style={{ marginTop: 34 }}>
      <h2 id={`forms-heading-${childId}`} style={{ margin: 0, font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>
        {waiting > 0 ? `${waiting} ${waiting === 1 ? "form" : "forms"} to answer` : "Forms from school"}
      </h2>
      <p style={{ margin: "6px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--sj-muted)" }}>
        Permission slips {childName}&rsquo;s school has sent. You can change an answer any time before the school
        closes the form.
      </p>
      {forms.map((f) => (
        <FormCard key={f.id} form={f} childId={childId} />
      ))}
    </section>
  );
}

function FormCard({ form, childId }: { form: FamilyFormView; childId: string }) {
  const [state, action, pending] = useActionState(answerConsentForm, {});
  // Controlled, so a refusal does not throw away what they chose — Next resets
  // an uncontrolled form after a server action, and being made to answer twice
  // because the server said no is the fastest way to lose somebody's goodwill.
  const [answer, setAnswer] = useState<ConsentAnswer | "">(form.answer ?? "");
  const [packed, setPacked] = useState(form.packedLunch);

  return (
    <div style={{ marginTop: 16, background: "var(--paper)", border: "2px solid var(--calm-border)", borderRadius: 16, padding: "18px 20px" }}>
      <h3 style={{ margin: 0, font: "600 18px var(--font-fredoka)", color: "var(--ink)" }}>{form.title}</h3>
      {form.closesOn && (
        <p style={{ margin: "4px 0 0", font: "400 14px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          Please answer by {form.closesOn}
        </p>
      )}
      {/* React escapes this, and a URL in it is a URL to read rather than a link
          to press — rule 15, the same treatment a message body gets. */}
      <p style={{ margin: "10px 0 0", font: "400 16px/1.65 var(--font-atkinson)", color: "var(--ink)", whiteSpace: "pre-wrap" }}>
        {form.formBody}
      </p>

      <form action={action} style={{ marginTop: 16 }}>
        <input type="hidden" name="formId" value={form.id} />
        <input type="hidden" name="studentId" value={childId} />
        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend style={{ font: "700 15px var(--font-atkinson)", color: "var(--ink)", padding: 0 }}>Your answer</legend>
          {CONSENT_ANSWERS.map((value) => (
            <label
              key={value}
              style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, minHeight: 44, font: "400 16px var(--font-atkinson)", color: "var(--ink)", cursor: "pointer" }}
            >
              <input
                type="radio"
                name="answer"
                value={value}
                checked={answer === value}
                onChange={() => setAnswer(value)}
                style={{ width: 22, height: 22 }}
              />
              {CONSENT_ANSWER_LABEL[value]}
            </label>
          ))}
        </fieldset>

        {form.asksPackedLunch && (
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, minHeight: 44, font: "400 16px var(--font-atkinson)", color: "var(--ink)", cursor: "pointer" }}>
            <input
              type="checkbox"
              name="packedLunch"
              checked={packed}
              onChange={(e) => setPacked(e.target.checked)}
              style={{ width: 22, height: 22 }}
            />
            {PACKED_LUNCH_LABEL}
          </label>
        )}

        {/* The line that is the reason there is no box to type in. */}
        <p style={{ margin: "14px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted)" }}>
          {CONSENT_OFFICE_LINE}
        </p>

        <button
          type="submit"
          disabled={pending || answer === ""}
          style={{ marginTop: 14, minHeight: 44, font: "700 15px var(--font-atkinson)", color: "var(--paper)", background: "var(--jam)", border: "none", borderRadius: 999, padding: "12px 24px", cursor: answer === "" ? "not-allowed" : "pointer", opacity: answer === "" ? 0.55 : 1 }}
        >
          {pending ? "Sending…" : form.answer ? "Change my answer" : "Send my answer"}
        </button>
      </form>

      {state?.error && (
        <p role="alert" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#C2476B" }}>{state.error}</p>
      )}
      {state?.done && (
        <p role="status" style={{ margin: "12px 0 0", font: "700 15px var(--font-atkinson)", color: "#2E6B64" }}>{state.done}</p>
      )}
      {!state?.done && form.answer && (
        <p style={{ margin: "12px 0 0", font: "400 15px var(--font-atkinson)", color: "#2E6B64" }}>
          Answered: {CONSENT_ANSWER_LABEL[form.answer]}
          {form.asksPackedLunch && form.packedLunch ? ", with a packed lunch provided" : ""}.
        </p>
      )}
    </div>
  );
}
