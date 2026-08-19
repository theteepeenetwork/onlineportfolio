import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LogoutForm } from "@/components/LogoutForm";
import { accountStateForTeacher, governingSubscription } from "@/lib/billing";
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
  const [profile, account, sub] = await Promise.all([
    db.teacher.findUnique({
      where: { id: user.teacher.id },
      select: { name: true, title: true, displayStyle: true, email: true, schoolName: true, country: true, foundingMember: true },
    }),
    accountStateForTeacher(teacher),
    governingSubscription(teacher),
  ]);
  if (!profile) return null;

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, font: "600 32px var(--font-fredoka)" }}>Account</h1>
        <p style={{ margin: "6px 0 0", font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          Your details, how you sign in, and what the school pays for.
        </p>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <ProfileForm
          fullName={profile.name}
          title={profile.title ?? "Mr"}
          displayStyle={(profile.displayStyle as DisplayStyle) ?? "formal"}
          school={profile.schoolName ?? ""}
          country={profile.country ?? "England"}
        />

        <SecurityForms email={profile.email} />

        <BillingPanel
          status={account.status}
          kind={account.kind}
          trialDaysLeft={account.trialDaysLeft}
          currentPeriodEndISO={account.currentPeriodEnd ? account.currentPeriodEnd.toISOString() : null}
          foundingMember={profile.foundingMember}
          isAdmin={user.teacher.staffRole === "ADMIN"}
          hasSchool={Boolean(user.teacher.schoolId)}
          hasCustomer={Boolean(sub?.stripeCustomerId)}
          hasLiveSubscription={Boolean(sub?.stripeSubscriptionId) && (account.status === "ACTIVE" || account.status === "PAST_DUE")}
          configured={stripeConfigured()}
          checkout={checkout === "success" ? "success" : checkout === "cancelled" ? "cancelled" : null}
          frozenNotice={frozen === "1"}
        />
      </div>

      {/* Signing out lives at the bottom of the page it belongs to, rather than
          on every screen: it is a thing you do once, at the end. */}
      <LogoutForm>
        <button
          type="submit"
          style={{ marginTop: 20, font: "700 15px var(--font-atkinson)", color: "var(--jam)", background: "transparent", border: "2px solid var(--jam)", borderRadius: 999, padding: "11px 22px", minHeight: 44, cursor: "pointer" }}
        >
          Sign out
        </button>
      </LogoutForm>
    </div>
  );
}
