import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountStateForTeacher, governingSubscription, planLabel } from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe";
import { AdminConsole, type StaffRow, type SchoolClass, type AuditEntry } from "./AdminConsole";

// The whole-school / staff admin space. Only a school ADMIN may enter — everyone
// else is bounced back to their own teacher view. Nothing here exposes any
// child's work; that stays scoped to whoever teaches the class.
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (user.teacher.staffRole !== "ADMIN" || !user.teacher.schoolId) redirect("/teacher");

  const school = await db.school.findUnique({
    where: { id: user.teacher.schoolId },
    include: {
      staff: {
        orderBy: { createdAt: "asc" },
        include: {
          classes: {
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, _count: { select: { students: true } } },
          },
        },
      },
    },
  });
  if (!school) redirect("/teacher");

  // Plan label is derived from the school's subscription state (never a stored
  // free-text string). Reading it also settles a lapsed trial into FROZEN.
  const teacherCtx = { id: user.teacher.id, schoolId: user.teacher.schoolId };
  const account = await accountStateForTeacher(teacherCtx);
  // The raw row too, for the billing pane: trial end, frozen date and whether a
  // Stripe customer exists (which decides if there is a portal to open). No card
  // data is stored here or anywhere — only Stripe ids.
  const sub = await governingSubscription(teacherCtx);

  const staff: StaffRow[] = school.staff.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    role: s.role,
    status: s.status,
    isYou: s.id === user.teacher.id,
    classes: s.classes.map((c) => c.name),
  }));

  // School-wide classes (for the Classes tab and the "assign classes" picker).
  const classes: SchoolClass[] = school.staff.flatMap((s) =>
    s.classes.map((c) => ({ id: c.id, name: c.name, teacherId: s.id, teacherName: s.name, children: c._count.students })),
  );

  const childrenCount = classes.reduce((a, c) => a + c.children, 0);

  // Recent safeguarding-relevant actions for this school (accountability).
  const auditRows = await db.auditLog.findMany({
    where: { schoolId: school.id },
    orderBy: { at: "desc" },
    take: 100,
  });
  // An audit entry about a MOMENT names the child it belongs to ("Approved
  // Poppy's moment"), because it is written for the teacher who did it. The
  // school-wide console is read by admins who may teach none of those classes,
  // and rule 5 says an admin is not all-seeing — so the WHO, WHAT and WHEN stay
  // (that is the accountability), and the child's name is withheld from anyone
  // but the member of staff who took the action.
  //
  // Redacted here, on the server, rather than by the client: the detail must not
  // travel to a browser that isn't entitled to it. Deny by default — anything
  // recorded against a child's work is treated as naming them, including audit
  // actions added later.
  const CHILD_SUBJECTS = new Set(["JOURNAL_ITEM", "STUDENT"]);
  const audit: AuditEntry[] = auditRows.map((a) => {
    const aboutAChild = CHILD_SUBJECTS.has(a.subjectType ?? "");
    const mine = a.actorId === user.teacher.id;
    return {
      id: a.id,
      atISO: a.at.toISOString(),
      actorName: a.actorName ?? a.actorType,
      action: a.action,
      detail: aboutAChild && !mine ? null : a.detail,
      redacted: aboutAChild && !mine,
    };
  });

  const billing = {
    schoolName: school.name,
    status: account.status,
    kind: account.kind,
    trialDaysLeft: account.trialDaysLeft,
    trialEndsISO: sub?.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
    currentPeriodEndISO: account.currentPeriodEnd ? account.currentPeriodEnd.toISOString() : null,
    frozenAtISO: account.frozenAt ? account.frozenAt.toISOString() : null,
    // The band bought isn't stored locally (the Stripe portal is the record of
    // what is charged), so the picker simply suggests the band this school's
    // roll falls into rather than claiming to know the current one.
    currentPlanKey: null,
    hasCustomer: Boolean(sub?.stripeCustomerId),
    // "Live" means actually running, not merely once-bought: a frozen school
    // keeps the id of the subscription that lapsed and must still be able to
    // buy its way back.
    hasLiveSubscription: Boolean(sub?.stripeSubscriptionId) && (account.status === "ACTIVE" || account.status === "PAST_DUE"),
    configured: stripeConfigured(),
    billingEmail: user.teacher.email,
    pupilsOnRoll: childrenCount,
  };

  return (
    <AdminConsole
      schoolName={school.name}
      plan={planLabel(account)}
      billing={billing}
      meId={user.teacher.id}
      staff={staff}
      classes={classes}
      childrenCount={childrenCount}
      audit={audit}
    />
  );
}
