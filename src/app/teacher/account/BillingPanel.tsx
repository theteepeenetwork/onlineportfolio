"use client";

import { useActionState, useState } from "react";
import { startCheckout, requestSchoolInvoice, openCustomerPortal } from "@/app/actions/billing";
import type { AccountStatus, PlanKind } from "@/lib/billing";
import { SCHOOL_BANDS, CHEAPEST_SCHOOL_PRICE, priceNote, formatPrice, type PlanKey } from "@/lib/billing-plans";
import { box, Notice } from "./panelChrome";
import { SchoolPlanPurchase } from "./SchoolPlanPurchase";

type Props = {
  status: AccountStatus | "NONE";
  kind: PlanKind | null;
  trialDaysLeft: number | null;
  currentPeriodEndISO: string | null;
  isAdmin: boolean;
  foundingMember: boolean;
  hasSchool: boolean;
  hasCustomer: boolean;
  /** True once a Stripe subscription exists. Buying again would create a SECOND one. */
  hasLiveSubscription: boolean;
  configured: boolean;
  checkout: "success" | "cancelled" | null;
  /** Set once, by the redirect a completed invoice/PO purchase lands on. */
  purchase: "invoice" | null;
  frozenNotice: boolean;
  /** The DfE register row this teacher's stored URN names, or null. */
  register: { name: string; town: string; postcode: string } | null;
  /** `Teacher.schoolName` — what to put in the name field when there is no register row. */
  schoolNameDefault: string;
};

export function BillingPanel(props: Props) {
  const { status, kind, trialDaysLeft, currentPeriodEndISO, isAdmin, hasSchool, hasCustomer, hasLiveSubscription, configured, foundingMember } = props;
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(startCheckout, {});
  const [invoiceState, invoiceAction, invoicePending] = useActionState(requestSchoolInvoice, {});
  const [portalState, portalAction, portalPending] = useActionState(openCustomerPortal, {});
  // The chosen band, held here so BOTH routes to purchase — card checkout and
  // invoice/PO — send the same one. (An earlier shape put the radios inside the
  // checkout form only, which silently billed the default band by invoice.)
  const [band, setBand] = useState<PlanKey>(SCHOOL_BANDS[1].key);

  const periodEnd = currentPeriodEndISO ? new Date(currentPeriodEndISO).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
  const err = checkoutState?.error || invoiceState?.error || portalState?.error;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {props.checkout === "success" && <Notice tone="good">Thank you — your plan is being set up. It can take a moment to show here.</Notice>}
      {props.checkout === "cancelled" && <Notice tone="info">Checkout was cancelled — nothing has been charged.</Notice>}
      {props.purchase === "invoice" && (
        <Notice tone="good">
          Your school is set up. The invoice will be emailed to your billing contact with 30-day
          terms, and your school can start straight away. You’ll find your staff, classes and
          billing under Admin. Until the payment reaches us there are three admin jobs that stay
          closed — your Admin page says which.
        </Notice>
      )}
      {props.frozenNotice && <Notice tone="warn">That needs an active plan. Renew below to carry on adding and changing work.</Notice>}
      {invoiceState?.sent && <Notice tone="good">We’ve raised the invoice — it will be emailed to your billing contact with 30-day terms.</Notice>}
      {err && <Notice tone="warn">{err}</Notice>}

      {/* Current status */}
      <section style={{ ...box, background: "var(--glass-light)" }} aria-labelledby="plan-heading">
        <h2 id="plan-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>Your plan</h2>
        <p style={{ margin: "8px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          {kind === "FREE" && (foundingMember
            ? "You’re a Founding teacher — free, unlimited, permanently. All your classes, every feature, no card and no end date. Thank you for backing StoryJar early."
            : "You’re on the free teacher plan — all your own classes, every feature, no card and no end date.")}
          {kind !== "FREE" && status === "TRIAL" && `Your school is trying the school plan — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left. No card needed until you subscribe.`}
          {kind !== "FREE" && status === "ACTIVE" && (periodEnd ? `School plan — renews ${periodEnd}.` : "Your school plan is active.")}
          {kind !== "FREE" && status === "PAST_DUE" && "A payment didn’t go through. We’re retrying it — your access stays on for now. Please update your card."}
          {kind !== "FREE" && status === "FROZEN" && "Your plan has paused, so the jar is read-only. Viewing and downloading still work. Renew to add or change work."}
          {status === "NONE" && "No plan is set up on this account yet."}
        </p>
      </section>

      {!configured && (
        <Notice tone="info">Billing isn’t connected in this environment yet. Once Stripe keys are set, the plan options below become live.</Notice>
      )}

      {/* A free teacher. The school plan is the only upgrade, and it is framed as
          what a SCHOOL needs — oversight, continuity, the data relationship —
          never as a capacity limit the teacher has hit.

          This used to end in "Ask your head or business manager to get in touch
          and we'll set it up", which was the only route to a paid plan in the
          product and ran through a person at StoryJar. It is now a purchase. */}
      {!hasSchool && (
        <>
          <section style={box} aria-labelledby="school-upgrade-heading">
            <h2 id="school-upgrade-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>Thinking about your whole school?</h2>
            <p style={{ margin: "6px 0 0", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
              Your own classes stay free for as long as you want them. The school plan starts
              at {formatPrice(CHEAPEST_SCHOOL_PRICE)} a year ({priceNote().toLowerCase()}), priced by how many pupils
              are on roll — and it adds the things a school needs rather than a teacher:
              oversight for leadership, work that stays with the school when staff move on,
              year-end transfer, and a data agreement naming the school as the data
              controller.
            </p>
          </section>
          <SchoolPlanPurchase
            register={props.register}
            defaultSchoolName={props.schoolNameDefault}
            configured={configured}
          />
        </>
      )}

      {/* School plan (admins only) */}
      {/* Only where nothing is running: a second checkout creates a second Stripe
          subscription and bills the school twice. Changing a live plan belongs
          in the portal below. */}
      {isAdmin && hasSchool && !hasLiveSubscription && (
        <section style={box} aria-labelledby="school-heading">
          <h2 id="school-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>School plan</h2>
          <p style={{ margin: "6px 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            One price for the whole school, by pupils on roll. Every teacher, every class,
            every feature — in every band. Your band is set once when you buy and is fixed
            for the year, so growing mid-year costs nothing extra. {priceNote()}.
            Pay by card or by invoice / purchase order (BACS).
          </p>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend className="label" style={{ padding: 0 }}>How many pupils are on roll?</legend>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {SCHOOL_BANDS.map((b) => (
                <label key={b.key} htmlFor={`band-${b.key}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44, font: "400 15px var(--font-atkinson)" }}>
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
                  <span><strong>{b.label}</strong> — {formatPrice(b.price)} a year<br />
                    <span style={{ color: "var(--sj-muted)" }}>{b.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <form action={checkoutAction} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
            <input type="hidden" name="plan" value={band} />
            <button className="btn-brand" type="submit" disabled={checkoutPending || !configured}>Pay by card</button>
          </form>
          <form action={invoiceAction} style={{ marginTop: 10 }}>
            <input type="hidden" name="plan" value={band} />
            <button className="sj-btn-outline" type="submit" disabled={invoicePending || !configured}>Request an invoice / PO instead</button>
          </form>
        </section>
      )}

      {/* Manage existing billing via the Stripe Customer Portal */}
      {hasCustomer && (
        <section style={box} aria-labelledby="manage-heading">
          <h2 id="manage-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>Manage billing</h2>
          <p style={{ margin: "6px 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            Update your card, change or cancel your plan, and download invoices on Stripe’s secure portal.
          </p>
          <form action={portalAction}>
            <button className="sj-btn-outline" type="submit" disabled={portalPending || !configured}>Open billing portal →</button>
          </form>
        </section>
      )}
    </div>
  );
}
