"use client";

import { useActionState, useState } from "react";
import { startCheckout, requestSchoolInvoice, openCustomerPortal } from "@/app/actions/billing";
import type { AccountStatus, PlanKind } from "@/lib/billing";
import { SCHOOL_BANDS, bandFor, bandForPupils, formatPrice, priceNote, type PlanKey } from "@/lib/billing-plans";
import type { SchoolMailHealth, SchoolMailHealthState } from "@/lib/schoolMailHealth";
import { CARD } from "./tabs";

// ---------------------------------------------------------------------------
// The admin Billing tab.
//
// This used to be one line stating the number of staff, which answered a
// question nobody asked and left the two that matter unanswered: what does the
// school owe, and what does someone have to DO about it? A business manager
// arriving here needs to be able to finish the job — pick the band, pay it or
// raise it as a PO, and know the date it next needs looking at.
//
// So the shape is: where you are → what happens next → the button that does it.
// Every state (never subscribed, trying it, active, payment retrying, paused)
// gets its own explicit next step. No child data appears anywhere on this page,
// and none is ever sent to Stripe (see src/app/actions/billing.ts).
// ---------------------------------------------------------------------------

type Props = {
  schoolName: string;
  status: AccountStatus | "NONE";
  kind: PlanKind | null;
  trialDaysLeft: number | null;
  trialEndsISO: string | null;
  currentPeriodEndISO: string | null;
  frozenAtISO: string | null;
  /** The band currently paid for, when Stripe has told us one. */
  currentPlanKey: PlanKey | null;
  hasCustomer: boolean;
  /** True once a Stripe subscription exists — changing it belongs in the portal, not in a second checkout. */
  hasLiveSubscription: boolean;
  configured: boolean;
  billingEmail: string;
  /** Children across all classes in this school — used to suggest a band, never to charge. */
  pupilsOnRoll: number;
  invoiceRequested: boolean;
  /** Whether StoryJar's outgoing email is working. Read on the server; it holds
   *  no address, no domain, no school and no child, which is why it can be a
   *  prop at all. See src/lib/schoolMailHealth.ts. */
  mailHealth: SchoolMailHealth;
};

const ukDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

function Notice({ tone, children }: { tone: "good" | "warn" | "info"; children: React.ReactNode }) {
  const palette = {
    good: { bg: "#E9F5F2", fg: "#2E6B64", border: "#B6D8D2" },
    warn: { bg: "#F7E0E6", fg: "#93304F", border: "#E8B7C4" },
    info: { bg: "#F3E9D6", fg: "#7A5510", border: "#E4D2AC" },
  }[tone];
  return (
    <p role="status" style={{ margin: 0, padding: "14px 18px", borderRadius: 14, background: palette.bg, color: palette.fg, border: `2px solid ${palette.border}`, font: "600 15px/1.5 var(--font-atkinson)" }}>
      {children}
    </p>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: n === 1 ? "none" : "1px solid #F0EADD" }}>
      <span aria-hidden style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: "#22304A", color: "#FAF6EE", display: "flex", alignItems: "center", justifyContent: "center", font: "700 14px var(--font-atkinson)" }}>{n}</span>
      <span>
        <span style={{ display: "block", font: "700 15px var(--font-atkinson)", color: "#22304A" }}>{title}</span>
        {children && <span style={{ display: "block", marginTop: 2, font: "400 15px/1.55 var(--font-atkinson)", color: "#43506B" }}>{children}</span>}
      </span>
    </li>
  );
}

const PRIMARY: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "#FAF6EE",
  background: "#C2476B",
  border: "none",
  borderRadius: 999,
  padding: "12px 24px",
  cursor: "pointer",
  boxShadow: "0 3px 0 #93304F",
};
const OUTLINE: React.CSSProperties = {
  font: "700 15px var(--font-atkinson)",
  color: "#22304A",
  background: "transparent",
  border: "2px solid #22304A",
  borderRadius: 999,
  padding: "11px 22px",
  cursor: "pointer",
};

const H2: React.CSSProperties = { margin: 0, font: "600 20px var(--font-fredoka)", color: "#22304A" };
const BODY: React.CSSProperties = { font: "400 15px/1.6 var(--font-atkinson)", color: "#43506B" };

export function BillingPane(props: Props) {
  const {
    schoolName, status, kind, trialDaysLeft, trialEndsISO, currentPeriodEndISO, frozenAtISO,
    currentPlanKey, hasCustomer, hasLiveSubscription, configured, billingEmail, pupilsOnRoll, invoiceRequested,
    mailHealth,
  } = props;

  const [checkoutState, checkoutAction, checkoutPending] = useActionState(startCheckout, {});
  const [invoiceState, invoiceAction, invoicePending] = useActionState(requestSchoolInvoice, {});
  const [portalState, portalAction, portalPending] = useActionState(openCustomerPortal, {});

  // Pre-select the band the school's own roll falls into. A suggestion only —
  // the band is the school's to confirm, and nothing here meters pupils.
  const suggested = bandForPupils(pupilsOnRoll);
  const [band, setBand] = useState<PlanKey>(currentPlanKey ?? suggested.key);

  const err = checkoutState?.error || invoiceState?.error || portalState?.error;
  const paid = status === "ACTIVE" || status === "PAST_DUE";
  const renews = ukDate(currentPeriodEndISO);
  const trialEnds = ukDate(trialEndsISO);
  const frozenOn = ukDate(frozenAtISO);
  const current = currentPlanKey ? bandFor(currentPlanKey) : null;
  const chosen = bandFor(band);

  return (
    <div style={{ display: "grid", gap: 20, marginTop: 24, maxWidth: 780 }}>
      {(invoiceState?.sent || invoiceRequested) && (
        <Notice tone="good">
          The invoice is on its way to the school&rsquo;s billing contact, with 30 days to pay. Full access is on
          now — it does not wait for the money. Reply to the invoice with your purchase order number and we&rsquo;ll
          add it.
        </Notice>
      )}
      {err && <Notice tone="warn">{err}</Notice>}
      {!configured && (
        <Notice tone="info">Card and invoice payment aren&rsquo;t switched on in this environment yet, so the buttons below are inactive.</Notice>
      )}

      {/* ── Where you are ─────────────────────────────────────────────── */}
      <section style={{ ...CARD, padding: "22px 24px" }} aria-labelledby="billing-status">
        <h2 id="billing-status" style={H2}>Where {schoolName} stands</h2>

        {status === "NONE" && (
          <p style={{ ...BODY, margin: "8px 0 0" }}>
            No plan is set up for the school yet. Staff on their own free teacher plans can carry on as they are —
            the school plan is what adds leadership oversight, staff and classes managed in one place, an audit log
            of who did what, work that stays with the school when staff move on, and a data agreement naming the
            school as the data controller.
          </p>
        )}

        {kind === "FREE" && (
          <p style={{ ...BODY, margin: "8px 0 0" }}>
            You&rsquo;re on the free teacher plan, which covers your own classes and has no end date. To bring the
            whole school in — every teacher, every class, one price — choose a band below.
          </p>
        )}

        {kind === "SCHOOL" && status === "TRIAL" && (
          <>
            <p style={{ margin: "10px 0 0", font: "600 34px var(--font-fredoka)", color: "#B07A1E" }}>
              {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left to try
            </p>
            <p style={{ ...BODY, margin: "4px 0 0" }}>
              A free half term, no card needed{trialEnds ? `, running to ${trialEnds}` : ""}. If nothing is arranged by
              then the jars turn read-only: everything stays viewable and downloadable, and only adding or changing
              work stops. Nothing is ever deleted without warning — the retention schedule in your data agreement
              says how long a paused account is kept and what we tell you first.
            </p>
          </>
        )}

        {kind === "SCHOOL" && status === "ACTIVE" && (
          <>
            <p style={{ margin: "10px 0 0", font: "600 34px var(--font-fredoka)", color: "#2E6B64" }}>
              {current ? formatPrice(current.price) : "School plan"}{current ? " a year" : ""}
            </p>
            <p style={{ ...BODY, margin: "4px 0 0" }}>
              {current ? `${current.label}. ` : ""}Active{renews ? ` — next payment due ${renews}` : ""}. Every teacher,
              every class, every feature. Your band is fixed for the paid year, so a school that grows mid-year pays
              nothing more until renewal.
            </p>
          </>
        )}

        {kind === "SCHOOL" && status === "PAST_DUE" && (
          <p style={{ ...BODY, margin: "8px 0 0" }}>
            A payment didn&rsquo;t go through and is being retried. Access is unaffected for now. Updating the card in
            the billing portal is the quickest fix; if the school pays by invoice, no action is needed beyond
            settling it.
          </p>
        )}

        {status === "FROZEN" && (
          <p style={{ ...BODY, margin: "8px 0 0" }}>
            The plan has paused{frozenOn ? ` (${frozenOn})` : ""}, so jars are read-only. Everything can still be viewed,
            downloaded and exported, and nothing has been deleted. Renewing below restores adding and changing
            straight away.
          </p>
        )}
      </section>

      {/* ── What to do next ───────────────────────────────────────────── */}
      <section style={{ ...CARD, padding: "22px 24px" }} aria-labelledby="billing-next">
        <h2 id="billing-next" style={H2}>What happens next</h2>
        <ol style={{ margin: "10px 0 0", padding: 0, listStyle: "none" }}>
          {status === "PAST_DUE" ? (
            <>
              <Step n={1} title="Update the card, or settle the invoice">
                If the school pays by card, the billing portal below is where to replace it. If it pays by
                invoice, nothing is needed here beyond finance paying it.
              </Step>
              <Step n={2} title="Nothing stops in the meantime">
                Access carries on while the payment is retried, and we email the billing contact before anything
                changes.
              </Step>
            </>
          ) : paid ? (
            <>
              <Step n={1} title="Nothing to do right now">
                {renews ? `The plan renews on ${renews}.` : "The plan is active."} We email the billing contact
                before anything is charged or invoiced.
              </Step>
              <Step n={2} title="Changed size, or need a different band?">
                Pick the band below and confirm — the change takes effect from the next renewal.
              </Step>
              <Step n={3} title="Invoices and receipts">
                Every invoice, past and present, is in the billing portal. Finance can be sent straight there.
              </Step>
            </>
          ) : (
            <>
              <Step n={1} title="Check the band">
                Bands go by pupils on roll. {pupilsOnRoll > 0
                  ? `Storyjar currently holds ${pupilsOnRoll} ${pupilsOnRoll === 1 ? "child" : "children"} across your classes, which puts you in “${suggested.label}” — but use your published roll, not this figure, if it differs.`
                  : "Use your published roll — the number on the school's own record, not how many children are in Storyjar today."}
              </Step>
              <Step n={2} title="Choose how the school pays">
                A card — including a school credit or purchasing card — pays immediately and starts the plan the
                same minute. An invoice with a purchase order is emailed to the billing contact with 30 days to
                pay, and access starts straight away rather than waiting for the money.
              </Step>
              <Step n={3} title="That's it">
                No per-teacher seats to count, no bolt-ons and no mid-year top-ups. The price you agree is the price
                for the year.
              </Step>
            </>
          )}
        </ol>
      </section>

      {/* ── Choose a band and pay ─────────────────────────────────────
          Only where there is nothing running. Once a plan is live, a second
          checkout would create a SECOND Stripe subscription and bill the school
          twice — changing a band is a change to the existing arrangement, which
          is what the portal is for. */}
      {hasLiveSubscription ? (
        <section style={{ ...CARD, padding: "22px 24px" }} aria-labelledby="billing-bands">
          <h2 id="billing-bands" style={H2}>Your band</h2>
          <p style={{ ...BODY, margin: "6px 0 14px" }}>
            One price for the whole school, by pupils on roll — every band carries every feature. Your band is
            fixed for the paid year, so a school that grows mid-year pays nothing more until renewal. To move to a
            different band, change the plan in the billing portal below rather than buying again; that way the
            school is never charged twice.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {SCHOOL_BANDS.map((b) => (
              <li key={b.key} style={{ font: "400 15px var(--font-atkinson)", color: "#43506B" }}>
                <strong>{b.label}</strong> — {formatPrice(b.price)} a year · {b.hint}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section style={{ ...CARD, padding: "22px 24px" }} aria-labelledby="billing-bands">
          <h2 id="billing-bands" style={H2}>Choose your band</h2>
          <p style={{ ...BODY, margin: "6px 0 14px" }}>
            One price for the whole school, by pupils on roll. Every band carries every feature — the band buys
            capacity, never functionality. {priceNote()}.
          </p>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend style={{ font: "700 14px var(--font-atkinson)", padding: 0, marginBottom: 8 }}>How many pupils are on roll?</legend>
            <div style={{ display: "grid", gap: 8 }}>
              {SCHOOL_BANDS.map((b) => (
                <label
                  key={b.key}
                  htmlFor={`admin-band-${b.key}`}
                  style={{ display: "flex", gap: 12, alignItems: "flex-start", minHeight: 44, padding: "12px 14px", borderRadius: 12, border: `2px solid ${band === b.key ? "#22304A" : "#E6E0D2"}`, background: band === b.key ? "#FFF8E9" : "transparent", cursor: "pointer", font: "400 15px var(--font-atkinson)" }}
                >
                  <input
                    type="radio"
                    id={`admin-band-${b.key}`}
                    name="band"
                    value={b.key}
                    checked={band === b.key}
                    onChange={() => setBand(b.key)}
                    style={{ marginTop: 2, width: 24, height: 24, flex: "none" }}
                  />
                  <span>
                    <strong>{b.label}</strong> — {formatPrice(b.price)} a year
                    {suggested.key === b.key && <span style={{ marginLeft: 8, font: "700 12px var(--font-atkinson)", color: "#7A5510", background: "#F3E3C3", borderRadius: 999, padding: "3px 9px" }}>matches your roll</span>}
                    <br />
                    <span style={{ color: "var(--sj-muted, #6B7385)" }}>{b.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16, alignItems: "center" }}>
            <form action={checkoutAction}>
              <input type="hidden" name="plan" value={band} />
              <button type="submit" disabled={checkoutPending || !configured} style={{ ...PRIMARY, opacity: checkoutPending || !configured ? 0.6 : 1 }}>
                {checkoutPending ? "Opening…" : `Pay ${formatPrice(chosen.price)} by card`}
              </button>
            </form>
            <form action={invoiceAction}>
              <input type="hidden" name="plan" value={band} />
              <button type="submit" disabled={invoicePending || !configured} style={{ ...OUTLINE, opacity: invoicePending || !configured ? 0.6 : 1 }}>
                {invoicePending ? "Raising…" : "Request an invoice / PO"}
              </button>
            </form>
          </div>
          {/* The refund that replaced the trial (docs/pricing-decisions.md,
              1 Sep 2026), in the same words as the landing page and the Terms.
              Every button that takes money says it. */}
          <p style={{ ...BODY, margin: "12px 0 0", fontWeight: 700 }}>
            Full refund within 42 days if it isn&rsquo;t right for your school.
          </p>
          <p style={{ ...BODY, margin: "6px 0 0", fontSize: 14 }}>
            Card payments are handled by Stripe — a school credit, debit or purchasing card all work, as do Apple
            Pay and Google Pay, and card details never reach Storyjar. The invoice route emails a bill with 30 days
            to pay; reply with your purchase order number and we&rsquo;ll put it on the invoice. Either way the plan
            starts straight away, so nothing waits on the money moving.
          </p>
        </section>
      )}

      {/* ── Manage an existing arrangement ────────────────────────────── */}
      {hasCustomer && (
        <section style={{ ...CARD, padding: "22px 24px" }} aria-labelledby="billing-manage">
          <h2 id="billing-manage" style={H2}>Invoices, cards and cancelling</h2>
          <p style={{ ...BODY, margin: "6px 0 14px" }}>
            Download invoices for finance, change the card, or cancel the plan. Cancelling never deletes anything —
            the school keeps read-only access, and the retention schedule in your data agreement applies from there.
          </p>
          <form action={portalAction}>
            <button type="submit" disabled={portalPending || !configured} style={{ ...OUTLINE, opacity: portalPending || !configured ? 0.6 : 1 }}>
              {portalPending ? "Opening…" : "Open the billing portal →"}
            </button>
          </form>
        </section>
      )}

      {/* ── Is our email arriving? ────────────────────────────────────── */}
      <MailHealthCard health={mailHealth} />

      {/* ── Who the paperwork goes to ─────────────────────────────────── */}
      <section style={{ ...CARD, padding: "22px 24px" }} aria-labelledby="billing-contact">
        <h2 id="billing-contact" style={H2}>Billing contact</h2>
        <p style={{ ...BODY, margin: "6px 0 0" }}>
          {hasCustomer ? (
            <>
              Invoices, renewal reminders and receipts go to the address held against the school&rsquo;s billing
              record — set when the plan was first arranged, which may not be yours. The billing portal shows it and
              is where to change it, so send it to the school office or a finance address if that suits better.
            </>
          ) : (
            <>
              Nothing has been billed yet. When a plan is arranged from this page, invoices and renewal reminders
              will go to <strong>{billingEmail}</strong> — you, as the admin arranging it. It can be changed
              afterwards in the billing portal.
            </>
          )}
        </p>
        <p style={{ ...BODY, margin: "10px 0 0" }}>
          Nothing about a child is ever sent to our payment provider — only the school&rsquo;s name and the billing
          contact&rsquo;s email.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The email health badge.
// ---------------------------------------------------------------------------
// The person reading this is the one parents ring when a sign-in link does not
// arrive, and until now she had nowhere to look — /ops/mail is the operator's
// screen and she cannot reach it.
//
// EVERY WORD ON IT COMES FROM THE DTO, deliberately. src/lib/schoolMailHealth.ts
// chose the headline, the detail and the caveats, and it is where the reasoning
// about what may honestly be claimed lives. This component picks an icon and
// lays it out. If the copy is wrong, it is wrong there, in one place, next to
// the rule that produced it — rather than half here and half there, which is how
// a badge ends up saying something the data does not support.
//
// TWO RULES IT KEEPS:
//
//  1. `scopeNote` is ALWAYS rendered. It is the sentence that stops this
//     overclaiming: the figures are StoryJar's whole email, not this school's,
//     because MailCounter has no school column and deliberately never will (F6 —
//     a per-send record would rebuild the address-enumeration signal the sign-in
//     form is careful not to give). A manager who inferred "my school's email is
//     fine" from a green badge would find out otherwise with a parent on the
//     phone, and that is precisely the F30 failure this is meant to end.
//  2. Status is never carried by colour alone (handbook section 6 item 8). Each
//     state has a WORD — "Working", "Needs attention" — and a symbol, and the
//     colour is the third signal rather than the only one.
function MailHealthCard({ health }: { health: SchoolMailHealth }) {
  const look = MAIL_LOOK[health.state];
  return (
    <section style={{ ...CARD, padding: "22px 24px" }} aria-labelledby="billing-mail">
      <h2 id="billing-mail" style={H2}>Email</h2>
      <p style={{ ...BODY, margin: "6px 0 0" }}>
        Whether the sign-in links StoryJar emails to parents are getting out.
      </p>

      <div
        role="status"
        style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 14, padding: "14px 18px", borderRadius: 14, background: look.bg, color: look.fg, border: `2px solid ${look.border}` }}
      >
        <span aria-hidden style={{ flexShrink: 0, font: "700 18px var(--font-atkinson)", lineHeight: "24px" }}>
          {look.mark}
        </span>
        <span>
          {/* The word, so the state survives greyscale, a colour-blind reader and
              a printout. */}
          <span style={{ display: "block", font: "700 13px var(--font-atkinson)", textTransform: "uppercase", letterSpacing: ".07em", opacity: 0.85 }}>
            {look.word}
          </span>
          <span style={{ display: "block", marginTop: 3, font: "700 17px/1.4 var(--font-atkinson)" }}>
            {health.headline}
          </span>
          <span style={{ display: "block", marginTop: 6, font: "400 15px/1.55 var(--font-atkinson)" }}>
            {health.detail}
          </span>
        </span>
      </div>

      {health.acceptedNote && (
        <p style={{ margin: "12px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted, #6B7385)" }}>
          {health.acceptedNote}
        </p>
      )}

      <p style={{ margin: "12px 0 0", font: "400 14px/1.55 var(--font-atkinson)", color: "var(--sj-muted, #6B7385)" }}>
        {health.scopeNote}
      </p>
    </section>
  );
}

// NO_DATA gets its own grey rather than borrowing the good palette: "nothing was
// sent" is not "everything worked", and the two must not look alike.
const MAIL_LOOK: Record<SchoolMailHealthState, { bg: string; fg: string; border: string; mark: string; word: string }> = {
  NO_DATA: { bg: "#F1EFE9", fg: "#4A5163", border: "#DAD4C6", mark: "–", word: "Nothing sent" },
  ALL_ACCEPTED: { bg: "#E9F5F2", fg: "#2E6B64", border: "#B6D8D2", mark: "✓", word: "Working" },
  SOME_FAILED: { bg: "#F3E9D6", fg: "#7A5510", border: "#E4D2AC", mark: "!", word: "Some failures" },
  NEEDS_ATTENTION: { bg: "#F7E0E6", fg: "#93304F", border: "#E8B7C4", mark: "!", word: "Needs attention" },
};
