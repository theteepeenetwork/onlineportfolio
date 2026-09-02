import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountStateForTeacher } from "@/lib/billing";
import { FrozenBanner } from "@/components/FrozenBanner";
import { SchoolInvitationBanner } from "@/components/SchoolInvitationBanner";
import { TeacherShell, type ShellClass } from "@/components/teacher/TeacherShell";
import { classTint } from "@/lib/classTints";

// Two initials for the identity-bar avatar, from the teacher's own name.
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}

// Guard: everything under /teacher requires a signed-in teacher.
//
// It is also where the persistent shell lives — the identity bar and the left
// rail are the only navigation in the teacher area, so they are rendered once
// here rather than by each page.
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login/teacher");
  if (user.role !== "TEACHER") redirect("/student");

  const teacherId = user.teacher.id;

  // Everything the shell shows is this teacher's own — the queries are scoped
  // by `teacherId`, so the rail and the badge can only ever show classes this
  // teacher teaches (SAFEGUARDING rule 4). This runs on EVERY navigation in the
  // teacher area, so it is kept to what the rail actually draws: no pupils, no
  // activities. The search box fetches its own index on first focus
  // (src/app/actions/teacherSearch.ts).
  const [account, profile, classes, waitingByClass, invitation] = await Promise.all([
    // Surface a read-only banner when the account is frozen. This also settles a
    // lapsed trial into FROZEN on first load. Server-side actions enforce the
    // real block regardless of whether this banner renders.
    accountStateForTeacher({ id: teacherId, schoolId: user.teacher.schoolId }),
    db.teacher.findUnique({
      where: { id: teacherId },
      select: { schoolName: true, school: { select: { name: true } } },
    }),
    db.class.findMany({
      where: { teacherId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    db.journalItem.groupBy({
      by: ["classId"],
      where: { status: "PENDING", class: { teacherId } },
      _count: { _all: true },
    }),
    // An open offer from a school to this teacher, for the banner.
    //
    // NOT ASKED FOR AT ALL ONCE THIS TEACHER HAS A SCHOOL, which is both the
    // cheap thing and the correct thing. Cheap, because this whole block runs
    // on EVERY navigation in the teacher area and almost every teacher who
    // reaches it belongs to a school, so the common case pays nothing.
    // Correct, because a teacher who already has a school cannot act on an
    // invitation — `joinSchoolPlan` refuses one outright — and a banner
    // pointing at a screen that can only say no is worse than no banner.
    //
    // A row like that is reachable: a schoolless teacher holding a pending
    // offer can buy a school of their own, and `claimSchool` supersedes
    // nothing. The offer then sits in the inviting school's console until it
    // lapses, which is a state the ADMIN side should probably close; this side
    // simply stops showing it.
    //
    // BOTH HALVES OF "OPEN", read together, exactly as `schoolInvitationIsOpen`
    // reads them: PENDING alone would surface an offer that ran out in March,
    // and an unexpired clock alone would surface one the school withdrew this
    // morning. It is expressed as a WHERE rather than by fetching and filtering
    // so the database does not hand this page rows it may not draw.
    //
    // Only what the banner draws: no role, no dates, no counts.
    user.teacher.schoolId
      ? Promise.resolve(null)
      : db.schoolInvitation.findFirst({
          where: {
            teacherId,
            state: "PENDING",
            expiresAt: { gt: new Date() },
            // AND THE SCHOOL MUST STILL BE VERIFIED, which is the third place
            // this condition is written and the reason all three agree.
            // `joinSchoolPlan` re-checks `School.verifiedAt` at the moment of
            // accepting, because a school can lose verification in the
            // fourteen days an offer stands. Without this clause the banner
            // would follow a teacher around every screen in the product,
            // naming a school, and lead to a page that refuses — the offer
            // still open, the sentence saying it is not. Found by
            // tests/battery/security/school-invitation-accept.spec.ts, which
            // asserts the refusal screen names no school, and caught the
            // BANNER above it doing so.
            school: { verifiedAt: { not: null } },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, invitedByName: true, school: { select: { name: true } } },
        }),
  ]);

  const waiting = new Map(waitingByClass.map((row) => [row.classId, row._count._all]));
  const pending = [...waiting.values()].reduce((a, b) => a + b, 0);

  const shellClasses: ShellClass[] = classes.map((c, i) => ({
    id: c.id,
    name: c.name,
    dot: classTint(i).jarFill,
    waiting: waiting.get(c.id) ?? 0,
  }));

  // ONE SLOT, TWO BANNERS, AND NO PRECEDENCE RULE — because the two conditions
  // cannot both be true. An invitation is only ever queried for above when
  // `schoolId` is null; a teacher with no school is governed by their own FREE
  // row; and a FREE row never freezes (RETENTION.md, "Free teacher plan vs
  // school plan": there is nothing to pay, so the billing route into FROZEN
  // does not exist for it). The `else if` shape is what a reader should take
  // from this — not a ranking of the two, but the fact that reaching the second
  // branch is the only way either renders. If a free account is ever made
  // freezable, this stops being a construction and becomes a choice somebody
  // has to write down.
  const banner = account.status === "FROZEN"
    ? <FrozenBanner />
    : invitation
      ? (
        <SchoolInvitationBanner
          invitationId={invitation.id}
          schoolName={invitation.school.name}
          invitedByName={invitation.invitedByName}
        />
      )
      : null;

  return (
    <TeacherShell
      teacher={{ name: user.teacher.displayName, initials: initialsOf(user.teacher.name) }}
      schoolName={profile?.school?.name ?? profile?.schoolName ?? null}
      isAdmin={user.teacher.staffRole === "ADMIN"}
      classes={shellClasses}
      pending={pending}
      banner={banner}
    >
      {children}
    </TeacherShell>
  );
}
