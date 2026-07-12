"use client";

import { useActionState } from "react";
import { startCheckout, requestSchoolInvoice, openCustomerPortal } from "@/app/actions/billing";
import type { AccountStatus } from "@/lib/billing";

type Props = {
  status: AccountStatus | "NONE";
  kind: "INDIVIDUAL" | "SCHOOL" | null;
  trialDaysLeft: number | null;
  currentPeriodEndISO: string | null;
  seatLimit: number | null;
  isAdmin: boolean;
  hasSchool: boolean;
  hasCustomer: boolean;
  configured: boolean;
  checkout: "success" | "cancelled" | null;
  frozenNotice: boolean;
};

const box: React.CSSProperties = { borderRadius: 16, padding: 20, border: "2px solid var(--calm-border)", background: "var(--paper)" };

function Notice({ tone, children }: { tone: "good" | "warn" | "info"; children: React.ReactNode }) {
  const bg = tone === "good" ? "#e8f5ec" : tone === "warn" ? "#fdecef" : "#eef4f8";
  const fg = tone === "good" ? "#1f6b3a" : tone === "warn" ? "#9a3b52" : "#2b5c74";
  return (
    <p role="status" style={{ ...box, background: bg, color: fg, border: "none", font: "600 15px var(--font-atkinson)", margin: "0 0 16px" }}>
      {children}
    </p>
  );
}

export function BillingPanel(props: Props) {
  const { status, trialDaysLeft, currentPeriodEndISO, isAdmin, hasSchool, hasCustomer, configured } = props;
  const [checkoutState, checkoutAction, checkoutPending] = useActionState(startCheckout, {});
  const [invoiceState, invoiceAction, invoicePending] = useActionState(requestSchoolInvoice, {});
  const [portalState, portalAction, portalPending] = useActionState(openCustomerPortal, {});

  const periodEnd = currentPeriodEndISO ? new Date(currentPeriodEndISO).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
  const err = checkoutState?.error || invoiceState?.error || portalState?.error;

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 720 }}>
      {props.checkout === "success" && <Notice tone="good">Thank you — your plan is being set up. It can take a moment to show here.</Notice>}
      {props.checkout === "cancelled" && <Notice tone="info">Checkout was cancelled — nothing has been charged.</Notice>}
      {props.frozenNotice && <Notice tone="warn">That needs an active plan. Renew below to carry on adding and changing work.</Notice>}
      {invoiceState?.sent && <Notice tone="good">We’ve raised the invoice — it will be emailed to your billing contact with 30-day terms.</Notice>}
      {err && <Notice tone="warn">{err}</Notice>}

      {/* Current status */}
      <section style={box} aria-labelledby="plan-heading">
        <h2 id="plan-heading" style={{ margin: 0, font: "600 22px var(--font-fredoka)", color: "var(--ink)" }}>Your plan</h2>
        <p style={{ margin: "8px 0 0", font: "400 16px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          {status === "TRIAL" && `You’re on the free trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left. No card needed until you subscribe.`}
          {status === "ACTIVE" && (periodEnd ? `Active — renews ${periodEnd}.` : "Your subscription is active.")}
          {status === "PAST_DUE" && "A payment didn’t go through. We’re retrying it — your access stays on for now. Please update your card."}
          {status === "FROZEN" && "Your plan has paused, so the jar is read-only. Viewing and downloading still work. Renew to add or change work."}
          {status === "NONE" && "No plan is set up on this account yet."}
        </p>
      </section>

      {!configured && (
        <Notice tone="info">Billing isn’t connected in this environment yet. Once Stripe keys are set, the plan options below become live.</Notice>
      )}

      {/* Individual plans (any teacher buys for themselves) */}
      {!hasSchool && (
        <section style={box} aria-labelledby="individual-heading">
          <h2 id="individual-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>Individual plan</h2>
          <p style={{ margin: "6px 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            You pay personally; your journals stay part of your school’s account. Pay by card, Apple&nbsp;Pay or Google&nbsp;Pay.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <form action={checkoutAction}>
              <input type="hidden" name="plan" value="individual_monthly" />
              <button className="btn-brand" type="submit" disabled={checkoutPending || !configured}>£3.99 / month</button>
            </form>
            <form action={checkoutAction}>
              <input type="hidden" name="plan" value="individual_annual" />
              <button className="btn-brand" type="submit" disabled={checkoutPending || !configured}>£40 / year</button>
            </form>
          </div>
        </section>
      )}

      {/* School plan (admins only) */}
      {isAdmin && hasSchool && (
        <section style={box} aria-labelledby="school-heading">
          <h2 id="school-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>School plan</h2>
          <p style={{ margin: "6px 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            £40 per teacher, per year. Pay by card or by invoice / purchase order (BACS).
          </p>
          <form action={checkoutAction} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input type="hidden" name="plan" value="school_seat_annual" />
            <div>
              <label className="label" htmlFor="seats">Number of teachers (seats)</label>
              <input className="input" id="seats" name="seats" type="number" min={1} max={1000} defaultValue={props.seatLimit ?? 1} style={{ width: 140 }} />
            </div>
            <button className="btn-brand" type="submit" disabled={checkoutPending || !configured}>Pay by card</button>
          </form>
          <form action={invoiceAction} style={{ marginTop: 10 }}>
            <input type="hidden" name="seats" value={props.seatLimit ?? 1} />
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
