"use client";

import { useActionState, useState } from "react";
import { startCheckout, requestSchoolInvoice } from "@/app/actions/billing";
import { SCHOOL_BANDS, formatPrice, priceNote, type PlanKey } from "@/lib/billing-plans";
import { box, Notice } from "./panelChrome";

// ---------------------------------------------------------------------------
// A teacher buys their school a plan, and becomes its first admin by doing it.
//
// This screen replaced a dead end: "Ask your head or business manager to get in
// touch and we'll set it up." Every real account was on the wrong side of it,
// because `db.school.create` existed only in seeds — so the only revenue path
// in the product ran through a founder's inbox (docs/pricing-decisions.md,
// 30 Aug 2026: buying is self-serve and there is no gatekeeper).
//
// WHAT THE PERSON HERE IS ACTUALLY DOING, and why the copy is written the way
// it is: they are naming a school that will exist afterwards. That name goes on
// an invoice a finance office has to recognise, and on the invitations their
// colleagues will be sent. So the name is shown before it is bought, in the
// words the DfE register uses, and the escape hatch from it is a plain button
// rather than an editable field they might not notice they have changed.
// ---------------------------------------------------------------------------

type RegisterEntry = { name: string; town: string; postcode: string };

type Props = {
  /**
   * The DfE register row this teacher's stored URN names, resolved on the
   * server. NULL COVERS TWO CASES AND NEEDS ONLY ONE BRANCH: the teacher has no
   * URN (everybody outside England, and any English school missing from the
   * register), and the teacher has a URN whose row a re-import has since
   * dropped. Both mean the same thing here — type the name.
   */
  register: RegisterEntry | null;
  /** `Teacher.schoolName`, the free text captured at signup. */
  defaultSchoolName: string;
  configured: boolean;
};

/**
 * THE THREE FIELDS EVERY PURCHASE FORM POSTS, rendered by ONE component used by
 * both of them.
 *
 * This exists because of a bug that has already happened once on this screen
 * (see the note in BillingPanel.tsx): the band radios lived inside the card
 * checkout form only, so pressing "Request an invoice / PO instead" posted no
 * band at all and silently billed the default one. The band is held in state
 * above both forms now, and these hidden inputs are the only way it reaches
 * either — so a form that forgets one is not a form somebody can write.
 *
 * The visible school-name input deliberately carries NO `name` attribute and
 * sits outside both forms. One input cannot be inside two forms, and a copy in
 * each is the same bug in a new costume; the typed value reaches the server
 * through `schoolName` below, from the one piece of state both forms read.
 *
 * A single form with `formAction` on each button would remove the duplication
 * outright, but it changes a shape the a11y and e2e suites already walk, for a
 * risk this component closes.
 */
function PurchaseFields({
  band,
  schoolName,
  claim,
}: {
  band: PlanKey;
  schoolName: string;
  claim: "register" | "free-text";
}) {
  return (
    <>
      <input type="hidden" name="plan" value={band} />
      <input type="hidden" name="schoolName" value={schoolName} />
      <input type="hidden" name="claim" value={claim} />
    </>
  );
}

export function SchoolPlanPurchase({ register, defaultSchoolName, configured }: Props) {
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(startCheckout, {});
  const [invoiceState, invoiceAction, invoicePending] = useActionState(requestSchoolInvoice, {});

  // One band, above both forms. See PurchaseFields.
  const [band, setBand] = useState<PlanKey>(SCHOOL_BANDS[1].key);
  // Which name is being bought. Starts on the register entry when there is one.
  const [useRegister, setUseRegister] = useState(Boolean(register));
  const [typedName, setTypedName] = useState(defaultSchoolName);

  const onRegister = Boolean(register) && useRegister;
  const claim: "register" | "free-text" = onRegister ? "register" : "free-text";
  const schoolName = onRegister ? register!.name : typedName;

  const err = checkoutState?.error || invoiceState?.error;
  const busy = checkoutPending || invoicePending;
  // Nothing to buy under: an empty name would be an invoice a finance office
  // cannot match to anything. The server refuses it too — this only saves the
  // person a round trip.
  const ready = schoolName.trim().length > 0;

  return (
    <section style={box} aria-labelledby="school-purchase-heading">
      <h2
        id="school-purchase-heading"
        style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}
      >
        Set your school up
      </h2>
      <p style={{ margin: "6px 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        One price for the whole school, by pupils on roll. Every teacher, every class, every
        feature — in every band. Your band is set once when you buy and is fixed for the year,
        so growing mid-year costs nothing extra. {priceNote()}. Pay by card, or by invoice /
        purchase order (BACS) if your finance office prefers.
      </p>

      {err && <Notice tone="warn">{err}</Notice>}

      {/* --- The school's name ------------------------------------------- */}
      <div style={{ marginBottom: 18 }}>
        {onRegister ? (
          <>
            <p style={{ margin: 0, font: "600 17px var(--font-atkinson)", color: "var(--ink)" }}>
              You’re setting up {register!.name}
            </p>
            <p style={{ margin: "4px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              {[register!.town, register!.postcode].filter(Boolean).join(", ")}
            </p>
            <p style={{ margin: "8px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              This is how your school is listed on the DfE register. It’s the name that will
              appear on your invoice and on your colleagues’ invitations.
            </p>
            {/* LOAD-BEARING, NOT POLITE. Changing your school in your profile
                never touches the URN stored at signup, so a teacher who has
                moved schools arrives here looking at the school they left. */}
            <button
              type="button"
              onClick={() => setUseRegister(false)}
              className="sj-btn-outline"
              style={{ marginTop: 12 }}
            >
              That’s not my school
            </button>
          </>
        ) : (
          <>
            <label className="label" htmlFor="claim-school-name" style={{ display: "block" }}>
              Your school’s name
            </label>
            <input
              id="claim-school-name"
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              aria-describedby="claim-school-name-hint"
              maxLength={120}
              autoComplete="organization"
              style={{
                width: "100%",
                maxWidth: 420,
                minHeight: 44,
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 12,
                border: "2px solid var(--ink)",
                font: "400 16px var(--font-atkinson)",
                background: "var(--cream)",
                color: "var(--ink)",
              }}
            />
            <p
              id="claim-school-name-hint"
              style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}
            >
              Use the name your finance office will recognise — it’s what goes on your invoice.
            </p>
            {register && (
              <button
                type="button"
                onClick={() => setUseRegister(true)}
                className="sj-btn-outline"
                style={{ marginTop: 12 }}
              >
                Use {register.name} instead
              </button>
            )}
          </>
        )}
      </div>

      {/* --- The band ----------------------------------------------------- */}
      {/* Lifted from the existing school-plan card unchanged: the same
          fieldset/legend, the same 24px dials and the same `band-` ids the a11y
          suite selects on. The two never render at once — this section is for a
          teacher with no school, that one for an admin who has one. */}
      <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
        <legend className="label" style={{ padding: 0 }}>How many pupils are on roll?</legend>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {SCHOOL_BANDS.map((b) => (
            <label
              key={b.key}
              htmlFor={`band-${b.key}`}
              style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44, font: "400 15px var(--font-atkinson)" }}
            >
              {/* 24px, not the browser's 13. The row is a 44px label and
                  clicking it selects the band, but the dial itself is what a
                  pointer lands on when it lands short (WCAG 2.2 AA 2.5.8). */}
              <input
                type="radio"
                id={`band-${b.key}`}
                name="band"
                value={b.key}
                checked={band === b.key}
                onChange={() => setBand(b.key)}
                style={{ width: 24, height: 24, flex: "none", marginTop: 1 }}
              />
              <span>
                <strong>{b.label}</strong> — {formatPrice(b.price)} a year
                <br />
                <span style={{ color: "var(--sj-muted)" }}>{b.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* --- The two ways to pay ------------------------------------------ */}
      <form action={checkoutAction} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
        <PurchaseFields band={band} schoolName={schoolName} claim={claim} />
        <button className="btn-brand" type="submit" disabled={busy || !configured || !ready}>
          Pay by card
        </button>
      </form>
      <form action={invoiceAction} style={{ marginTop: 10 }}>
        <PurchaseFields band={band} schoolName={schoolName} claim={claim} />
        <button className="sj-btn-outline" type="submit" disabled={busy || !configured || !ready}>
          Request an invoice / PO instead
        </button>
      </form>
      {/* THE REFUND, AT THE MOMENT OF PRESSING. It replaced the trial on
          1 September 2026 (docs/pricing-decisions.md) and is the reassurance a
          business manager is looking for right here, but it lived only on the
          landing page and in the Terms. Same sentence as the landing page,
          deliberately: a promise worded two ways is a promise somebody has to
          compare. */}
      <p style={{ margin: "12px 0 0", font: "600 15px var(--font-atkinson)", color: "var(--ink)" }}>
        Full refund within 42 days if it isn’t right for your school.
      </p>
      <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
        An invoice is emailed with 30 days to pay, and your school can start straight away. You
        become the school’s first admin either way, and can invite the rest of your staff.
      </p>
    </section>
  );
}
