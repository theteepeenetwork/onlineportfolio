import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LogoutForm } from "@/components/LogoutForm";
import { accountStateForTeacher, governingSubscription, writableSchoolPlanWhere } from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe";
import type { DisplayStyle } from "@/lib/teacherName";
import { ProfileForm } from "./ProfileForm";
import { SecurityForms } from "./SecurityForms";
import { BillingPanel } from "./BillingPanel";
import { ConnectClaude } from "./ConnectClaude";
import { InvitationCard } from "./InvitationCard";
import { Notice } from "./panelChrome";
import { originUrl } from "@/lib/appOrigin";

// Account settings — the teacher's own profile, sign-in details and plan/billing.
// Teacher-only (no child-facing page). Profile & security edits stay available
// even when the account is frozen (account management), while the billing panel
// offers the way back to full access.
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; frozen?: string; purchase?: string; joined?: string; closed?: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") return null;
  const { checkout, frozen, purchase, joined, closed } = await searchParams;

  const teacher = { id: user.teacher.id, schoolId: user.teacher.schoolId };
  const [profile, account, sub, tokens, apps, origin, planEnded] = await Promise.all([
    db.teacher.findUnique({
      where: { id: user.teacher.id },
      select: { name: true, title: true, displayStyle: true, email: true, schoolName: true, urn: true, country: true, foundingMember: true },
    }),
    accountStateForTeacher(teacher),
    governingSubscription(teacher),
    // The teacher's own connector tokens. `hint` and the timestamps only — the
    // token itself was never stored, so there is nothing here to leak.
    db.apiToken.findMany({
      where: { teacherId: user.teacher.id, kind: "PERSONAL" },
      select: { id: true, label: true, hint: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: "desc" },
    }),
    // Apps connected through claude.ai, so a teacher can see and undo them.
    db.oAuthGrant.findMany({
      where: { teacherId: user.teacher.id },
      select: { id: true, createdAt: true, oauthClient: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    originUrl(),
    // Did a school plan end under this teacher, and did she get her account back?
    //
    // Read ONLY when she has no school, and only as the most recent row: this is
    // a card on one page, not a state the app carries around. `settleSchoolPlanEnd`
    // writes it (src/lib/schoolPlanEnd.ts) and promises she is "told so in words
    // rather than finding an empty dashboard" — this is that promise, and if this
    // read is ever removed, remove the promise with it.
    user.teacher.schoolId
      ? null
      : db.auditLog.findFirst({
          where: { action: "SCHOOL_PLAN_ENDED_TEACHER_DETACHED", subjectType: "TEACHER", subjectId: user.teacher.id },
          orderBy: { at: "desc" },
          select: { at: true, detail: true },
        }),
  ]);
  if (!profile) return null;

  // The register row this teacher's stored URN names, for the purchase section.
  //
  // Read HERE and never posted, which is the point: the name and the URN come
  // out of the same `Establishment` row in the same request, so a tampered
  // client can choose only WHETHER to use its own teacher's URN, never which one
  // (docs/school-identity.md §2). `findUnique` returning null covers both "no
  // URN" and "a re-import dropped that row" — one branch, no special case.
  //
  // Only fetched for a teacher with no school: nobody else can see the section,
  // and an admin's account page should not be querying the register at all.
  const register =
    !user.teacher.schoolId && profile.urn
      ? await db.establishment.findUnique({
          where: { urn: profile.urn },
          select: { name: true, town: true, postcode: true },
        })
      : null;

  // Open invitations, for the card below. Same WHERE as the teacher layout's
  // banner query and for the same reasons: both halves of "open" together, and
  // not asked for at all once she has a school, because she could not act on
  // one. Unlike the banner this lists every open offer rather than the most
  // recent, since this is the screen somebody comes to in order to deal with
  // them.
  const invitations = user.teacher.schoolId
    ? []
    : await db.schoolInvitation.findMany({
        where: {
          teacherId: user.teacher.id,
          state: "PENDING",
          expiresAt: { gt: new Date() },
          // The verified clause the banner carries, for the reason it carries
          // it: an offer a teacher cannot accept must not be advertised to her
          // by name on a screen whose only link refuses.
          //
          // And the writable-plan clause beside it, for the same reason again.
          // A school that paid and then lapsed keeps `verifiedAt` and keeps its
          // `kind: "SCHOOL"` row, so verification alone would still name it
          // here; `joinSchoolPlan` settles the plan's effective status and
          // refuses. See `writableSchoolPlanWhere`, which is written to agree
          // with that settle.
          school: { verifiedAt: { not: null }, subscription: writableSchoolPlanWhere() },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, invitedByName: true, school: { select: { name: true } } },
      });

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, font: "600 32px var(--font-fredoka)" }}>Account</h1>
        <p style={{ margin: "6px 0 0", font: "400 17px var(--font-atkinson)", color: "var(--sj-muted)" }}>
          Your details, how you sign in, and what the school pays for.
        </p>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {/* An offer she has not answered goes above her own details: it is the
            only thing on this page with somebody else waiting on it. */}
        <InvitationCard
          invitations={invitations.map((inv) => ({
            id: inv.id,
            schoolName: inv.school.name,
            invitedByName: inv.invitedByName,
          }))}
        />

        {/* Set by the redirect at the end of `joinSchoolPlan`. It says what
            happened rather than "success", because what happened is the thing
            the acceptance screen spent five paragraphs on. */}
        {closed === "1" && (
          // The admin who just closed their school's account. They were detached
          // with everybody else, so the console no longer knows them and sent
          // them here — this is the only thing standing between them and no word
          // at all about whether the most consequential action in the product
          // worked. The durable record is the SCHOOL_CLOSED row in the school's
          // audit log.
          <Notice tone="good">
            Your school&rsquo;s account is closed and the instruction is recorded, with today&rsquo;s date on it. You are
            back on your own free StoryJar account, with any classes you brought with you when you joined.{" "}
            <strong>Nothing has been deleted</strong> — the children&rsquo;s work is still held and is removed on the
            retention schedule. If the school needs it sooner, or needs a copy first, write to us.
          </Notice>
        )}
        {planEnded && (
          // Said plainly, and without a number she would have to interpret: the
          // audit row's own detail already names the school, what came back with
          // her and that nothing was deleted, so it is shown rather than
          // paraphrased into a second version that can drift from it.
          <Notice tone="info">
            {planEnded.detail} If your school starts a new plan, you can join it again from an
            invitation — nothing here has to be set up twice.
          </Notice>
        )}
        {joined === "1" && (
          <Notice tone="good">
            You have joined the school. Your classes and the children in them are the
            school&rsquo;s now, and its plan covers you. Nothing has moved and your class codes are
            unchanged.
          </Notice>
        )}

        <ProfileForm
          fullName={profile.name}
          title={profile.title ?? "Mr"}
          displayStyle={(profile.displayStyle as DisplayStyle) ?? "formal"}
          school={profile.schoolName ?? ""}
          country={profile.country ?? "England"}
        />

        <SecurityForms email={profile.email} />

        <ConnectClaude
          mcpUrl={`${origin}/api/mcp`}
          tokens={tokens.map((t) => ({
            id: t.id,
            label: t.label,
            hint: t.hint,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
          }))}
          apps={apps.map((a) => ({ id: a.id, name: a.oauthClient.name, createdAt: a.createdAt.toISOString() }))}
        />

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
          purchase={purchase === "invoice" ? "invoice" : null}
          frozenNotice={frozen === "1"}
          register={register}
          schoolNameDefault={profile.schoolName ?? ""}
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
