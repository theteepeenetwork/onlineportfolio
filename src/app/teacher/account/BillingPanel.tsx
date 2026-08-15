"use client";

import { useActionState } from "react";
import { startCheckout, requestSchoolInvoice, openCustomerPortal } from "@/app/actions/billing";
import type { AccountStatus, PlanKind } from "@/lib/billing";

type Props = {
  status: AccountStatus | "NONE";
  kind: PlanKind | null;
  trialDaysLeft: number | null;
  currentPeriodEndISO: string | null;
  isAdmin: boolean;
  foundingMember: boolean;
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
  const { status, kind, trialDaysLeft, currentPeriodEndISO, isAdmin, hasSchool, hasCustomer, configured, foundingMember } = props;
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
          {kind === "FREE" && (foundingMember
            ? "You’re a Founding teacher — free, unlimited, permanently. All your classes, every feature, no card and no end date. Thank you for backing Storyjar early."
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

      {/* A free teacher: nothing to buy. The school plan is the only upgrade, and
          it is framed as what a SCHOOL needs — oversight, continuity, the data
          relationship — never as a capacity limit the teacher has hit. */}
      {!hasSchool && (
        <section style={box} aria-labelledby="school-upgrade-heading">
          <h2 id="school-upgrade-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>Thinking about your whole school?</h2>
          <p style={{ margin: "6px 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            Your own classes stay free for as long as you want them. The school plan is
            £299 a year, flat — for every teacher, however many pupils — and adds the
            things a school needs rather than a teacher: oversight for leadership, work
            that stays with the school when staff move on, year-end transfer, and a data
            agreement naming the school as the data controller.
          </p>
          <p style={{ margin: 0, font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            Ask your head or business manager to get in touch and we’ll set it up — or
            we can send a one-page summary you can forward.
          </p>
        </section>
      )}

      {/* School plan (admins only) */}
      {isAdmin && hasSchool && (
        <section style={box} aria-labelledby="school-heading">
          <h2 id="school-heading" style={{ margin: 0, font: "600 20px var(--font-fredoka)", color: "var(--ink)" }}>School plan</h2>
          <p style={{ margin: "6px 0 14px", font: "400 15px var(--font-atkinson)", color: "var(--sj-muted)" }}>
            £299 a year, flat — every teacher, every class, every pupil, every feature.
            No seat counts to keep up to date and nothing to recalculate when staff join
            or leave. Pay by card or by invoice / purchase order (BACS).
          </p>
          <form action={checkoutAction} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input type="hidden" name="plan" value="school_annual" />
            <button className="btn-brand" type="submit" disabled={checkoutPending || !configured}>Pay £299 by card</button>
          </form>
          <form action={invoiceAction} style={{ marginTop: 10 }}>
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
