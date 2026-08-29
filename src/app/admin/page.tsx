import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountStateForTeacher, governingSubscription, planLabel } from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe";
import { readSchoolMailHealth } from "@/lib/schoolMailHealth";
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

  // WHICH CLASSES ARRIVED HERE BECAUSE SOMEBODY WAS REMOVED.
  //
  // This flag is load-bearing rather than decorative, and that is why it ships
  // in the same change as the thing it describes. Removing a member of staff
  // moves their classes to the admin who pressed the button, which hands a
  // non-teaching adult a class of children's journals and approval queues — a
  // widening of SAFEGUARDING rule 5, accepted as an owner decision on 29 August
  // 2026 (docs/dpo-decisions.md) on the condition that the holding is visibly
  // TEMPORARY. A silent dump of thirty classes is a permanent widening that
  // nobody ever looks at; a flagged one is a to-do list.
  //
  // Read from the AUDIT LOG rather than a new column, because the audit is
  // already the authoritative custody history: removal writes one CLASS_ASSIGNED
  // row per moved class, and so does ordinary reassignment. No migration, and
  // the flag cannot drift from the record a school would be shown if it asked.
  const custody = await db.auditLog.findMany({
    where: { schoolId: school.id, action: "CLASS_ASSIGNED", subjectType: "CLASS" },
    orderBy: { at: "desc" },
    select: { subjectId: true, detail: true, at: true },
  });
  const inheritedOnRemoval = new Map<string, string>();
  for (const row of custody) {
    if (!row.subjectId || inheritedOnRemoval.has(row.subjectId)) continue; // newest wins
    if (row.detail?.includes("was removed from the school")) {
      inheritedOnRemoval.set(row.subjectId, row.detail);
    }
  }

  // School-wide classes (for the Classes tab and the "assign classes" picker).
  const classes: SchoolClass[] = school.staff.flatMap((s) =>
    s.classes.map((c) => ({
      id: c.id,
      name: c.name,
      teacherId: s.id,
      teacherName: s.name,
      children: c._count.students,
      inherited: inheritedOnRemoval.get(c.id) ?? null,
    })),
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
    // "Is our email arriving?" — the question the business manager is rung
    // about. Read here rather than in the client, and deliberately NOT wrapped
    // in a try/catch: a failed read must break the page rather than render as
    // "no emails were sent", which would be a problem that looks like
    // everything being fine. The object holds no address, domain, school or
    // child, which is why it may cross to the browser at all.
    mailHealth: await readSchoolMailHealth(),
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
