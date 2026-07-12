import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopBar } from "@/components/TopBar";
import { teacherNav } from "@/lib/teacherNav";
import { accountStateForTeacher, governingSubscription, planLabel } from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe";
import type { DisplayStyle } from "@/lib/teacherName";
import { ProfileForm } from "./ProfileForm";
import { SecurityForms } from "./SecurityForms";
import { BillingPanel } from "./BillingPanel";

// Account settings — the teacher's own profile, sign-in details and plan/billing.
// Teacher-only (no child-facing page). Profile & security edits stay available
// even when the account is frozen (account management), while the billing panel
// offers the way back to full access.
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; frozen?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { checkout, frozen } = await searchParams;

  const teacher = { id: user.teacher.id, schoolId: user.teacher.schoolId };
  const [profile, account, sub, pending] = await Promise.all([
    db.teacher.findUnique({
      where: { id: user.teacher.id },
      select: { name: true, title: true, displayStyle: true, email: true, schoolName: true, country: true },
    }),
    accountStateForTeacher(teacher),
    governingSubscription(teacher),
    db.journalItem.count({ where: { status: "PENDING", class: { teacherId: user.teacher.id } } }),
  ]);
  if (!profile) return null;

  const sectionTitle: React.CSSProperties = { margin: "8px 0 2px", font: "600 15px var(--font-atkinson)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--sj-muted)" };

  return (
    <>
      <TopBar title="Account" subtitle={planLabel(account)} links={teacherNav(pending)} />
      <main className="sj" style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 24px 48px" }}>
        <div style={{ display: "grid", gap: 20, maxWidth: 760 }}>
          <h2 style={sectionTitle}>Profile</h2>
          <ProfileForm
            fullName={profile.name}
            title={profile.title ?? "Mr"}
            displayStyle={(profile.displayStyle as DisplayStyle) ?? "formal"}
            school={profile.schoolName ?? ""}
            country={profile.country ?? "England"}
          />

          <SecurityForms email={profile.email} />

          <h2 style={sectionTitle}>Plan &amp; billing</h2>
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
        </div>
      </main>
    </>
  );
}
