import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { accountStateForTeacher, governingSubscription, planLabel } from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe";
import { BillingPanel } from "./BillingPanel";

// The billing / plan space. Teacher-only (no child-facing page ever loads this
// or any Stripe code). Card data never touches our servers — purchase and plan
// changes happen on Stripe's hosted Checkout and Customer Portal.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; frozen?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { checkout, frozen } = await searchParams;

  const teacher = { id: user.teacher.id, schoolId: user.teacher.schoolId };
  const account = await accountStateForTeacher(teacher);
  const sub = await governingSubscription(teacher);

  const pending = await db.journalItem.count({
    where: { status: "PENDING", class: { teacherId: user.teacher.id } },
  });

  return (
    <>
      <TopBar
        title="Billing & plan"
        subtitle={planLabel(account)}
        links={teacherNav(pending)}
      />
      <main className="sj" style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 24px 48px" }}>
        <BillingPanel
          status={account.status}
          kind={account.kind}
          trialDaysLeft={account.trialDaysLeft}
          currentPeriodEndISO={account.currentPeriodEnd ? account.currentPeriodEnd.toISOString() : null}
          seatLimit={account.seatLimit}
          isAdmin={user.teacher.staffRole === "ADMIN"}
          hasSchool={Boolean(user.teacher.schoolId)}
          hasCustomer={Boolean(sub?.stripeCustomerId)}
          configured={stripeConfigured()}
          checkout={checkout === "success" ? "success" : checkout === "cancelled" ? "cancelled" : null}
          frozenNotice={frozen === "1"}
        />
      </main>
    </>
  );
}
