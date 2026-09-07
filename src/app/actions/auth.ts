"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { isFoundingSignup, restoreFreePlanFor } from "@/lib/billing";
import { uniqueClassCode } from "@/lib/classCode";
import { AVATAR_PALETTE } from "@/lib/avatar";
import { deriveTeacherName, type DisplayStyle } from "@/lib/teacherName";
import { deriveChildNames } from "@/lib/childNames";
import { normaliseAgeModeInput } from "@/lib/ageMode";
import { isRateLimited, recordFailure, clearFailures, clientIp, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";

// StoryJar avatar palette — children get a colour bubble in rotation.

export type SignupResult = { error?: string; step?: number };

// The StoryJar 5-step signup wizard submits everything at once: it creates the
// teacher, their first class jar (with a generated class code), and the class
// list, signs them in, and returns the class code to show on the success step.
export async function createTeacherAccount(input: {
  title: string;
  fullName: string;
  displayStyle: DisplayStyle;
  email: string;
  password: string;
  school: string;
  /**
   * The DfE URN the teacher picked, or null when they typed the name instead.
   * Stored ALONGSIDE `school`, never in place of it (docs/school-identity.md
   * §2): the free text is what the teacher believes their school is called and
   * is what the teacher shell and the ops console already show; the URN is a
   * join key for later. Keeping both is what stops a future re-import renaming
   * a teacher's own school out from under them.
   */
  urn: string | null;
  country: string;
  yearGroup: string;
  className: string;
  ageMode: string | null;
  children: string[];
}): Promise<SignupResult> {
  const fullName = input.fullName.trim();
  const title = input.title.trim();
  const displayStyle: DisplayStyle = input.displayStyle === "first" ? "first" : "formal";
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const school = input.school.trim();
  const className = input.className.trim();

  // Server-side validation, returning the step to send the user back to.
  if (!fullName) return { error: "Pop your full name in first.", step: 1 };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { error: "That email doesn’t look quite right — check for typos.", step: 1 };
  if (password.length < 8)
    return { error: "Your password needs at least 8 characters.", step: 1 };
  if (!school) return { error: "What’s your school called?", step: 2 };
  if (!className) return { error: "Give your class a name — anything you like.", step: 3 };

  // The URN is CHECKED AGAINST THE REGISTER, not taken on trust.
  //
  // This is a server action, so `input.urn` is whatever the caller sent, and
  // the picker is not the only possible caller. A URN that is not in the
  // register is worse than no URN at all: null honestly says "this teacher
  // typed their school's name", while a made-up key is a join that will one day
  // be followed. It is also the only field on the row a later step will trust
  // without asking a human, so it earns a lookup.
  //
  // A URN that does not check out is DROPPED rather than refused. Nothing is
  // lost by dropping it — the free text the teacher typed is the school name
  // either way, and it is the field the product displays — and a signup is not
  // the place to make somebody argue with a validator about a field they did
  // not know existed.
  //
  // AND A REAL TEACHER CAN REACH THIS BRANCH, which an earlier version of this
  // comment denied. The import replaces the register wholesale, so a school
  // picked on step 2 can be gone by the time step 4 submits — no tampering
  // required, just a refresh landing mid-signup. That is the case the drop is
  // FOR: refusing would fail a real teacher over a row that moved underneath
  // them, and it is driven end to end in tests/e2e/school-picker.spec.ts.
  //
  // WHAT IT DOES NOT CHECK, said here rather than assumed: that the URN matches
  // the NAME beside it. A tampered client can still send one school's name with
  // another's URN. The row is already fetched, so requiring a match is cheap —
  // and it is deliberately not done, because it would reject a real teacher
  // whose school has been renamed in the register since they picked it. The
  // asymmetry is recorded in docs/school-identity.md; the blast radius is one
  // adult's own account, self-inflicted, joined to nothing.
  //
  // Country is part of the check because GIAS is the English register. A URN
  // beside "Wales" is a join pointing at the wrong country, and the picker is
  // not even rendered there.
  const urn =
    input.urn && input.country === "England" &&
    (await db.establishment.findUnique({ where: { urn: input.urn }, select: { urn: true } }))
      ? input.urn
      : null;

  // The class list, through the SAME derivation the roster uses.
  //
  // This used to be `raw.trim()`, and that was finding F39: a teacher pasting
  // their register on their first morning — the way it comes out of the office
  // system, with surnames on it — had "Ali Hassan" stored verbatim, while the
  // identical paste made ten minutes later inside the app was reduced to "Ali".
  // SAFEGUARDING rule 2 ("we store a child's first name and their work; no
  // surnames") is a hard limit under UK GDPR Art. 5(1)(c), not a preference, and
  // `Student.name` is the label on the name cards at /login/student?code=…, a
  // screen the whole class reads off a code written on the board.
  //
  // `deriveChildNames` drops the surname and adds back only the shortest prefix
  // that tells two Olivias apart. There is no existing roster to disambiguate
  // against here — the class is created below, from this list — so it is called
  // with no existing names, which is exactly right for the first paste.
  const children = deriveChildNames(input.children);
  if (children.length === 0)
    return { error: "Add at least one first name to get started.", step: 4 };

  const existing = await db.teacher.findUnique({ where: { email } });
  if (existing)
    return { error: "An account with that email already exists. Try signing in.", step: 1 };

  const { displayName } = deriveTeacherName({ title, fullName, displayStyle });
  const teacher = await db.teacher.create({
    data: {
      name: fullName,
      title,
      displayStyle,
      displayName,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      schoolName: school,
      urn,
      country: input.country,
      // Signed up before launch day → a Founding teacher, promised free
      // unlimited access permanently. Decided once, here, and stored — never
      // re-derived from `createdAt` (docs/pricing-decisions.md).
      foundingMember: isFoundingSignup(),
    },
  });

  // Every new teacher account is on the permanently FREE plan: one teacher, all
  // of their own classes, full write access, no card and no countdown
  // (docs/pricing-decisions.md). ACTIVE with a NULL `trialEndsAt` is what encodes
  // "nothing to lapse" — there is no route from here to FROZEN. Without this row
  // the write gate would (correctly) deny by default, so it must exist from
  // signup.
  //
  // Written through `restoreFreePlan`'s definition rather than inline. Signup
  // used to be the ONLY place a free row was ever created, which is how
  // `removeStaff` came to detach a teacher into having no subscription at all.
  // There is now one definition of the row and every path uses it, so the two
  // cannot drift apart again.
  await restoreFreePlanFor(teacher.id);

  const code = await uniqueClassCode();
  const klass = await db.class.create({
    data: {
      name: className,
      yearGroup: input.yearGroup,
      // Asked once, on the class step. NULL (skipped) → younger; never nudged.
      ageMode: normaliseAgeModeInput(input.ageMode),
      classCode: code,
      teacherId: teacher.id,
    },
  });

  await db.student.createMany({
    data: children.map((childName, i) => ({
      name: childName,
      classId: klass.id,
      avatarColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length],
    })),
  });

  await createSession({ role: "TEACHER", teacherId: teacher.id });
  // The success screen (class code + sign-in guide) lives at its own route so
  // it survives the post-action refresh and can be returned to.
  redirect("/signup/teacher/welcome");
}

// Teacher signs in with email + password.
export async function teacherLogin(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  // Throttle brute force per account+source (FINDINGS F2). A correct sign-in
  // below clears the counter, so honest repeated logins are never blocked.
  const key = `login:${email}:${await clientIp()}`;
  if (isRateLimited(key)) {
    return { error: RATE_LIMITED_MESSAGE };
  }

  const teacher = await db.teacher.findUnique({ where: { email } });
  if (!teacher || !(await bcrypt.compare(password, teacher.passwordHash))) {
    recordFailure(key);
    return { error: "That email and password don't match." };
  }

  clearFailures(key);
  await createSession({ role: "TEACHER", teacherId: teacher.id });
  redirect(safeNext(formData.get("next")));
}

// Where to send a teacher after signing in.
//
// Deliberately NOT a general "return to where you were" hook. Exactly one flow
// needs it — a teacher who clicked "add StoryJar" on claude.ai and was sent to
// sign in first (src/app/oauth/authorize) — and honouring anything else here
// would turn the sign-in form into an open redirect, which is a phishing tool
// pointed at the people who hold children's work. So: a same-site path, on the
// one route that needs it, or the teacher's own dashboard.
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/oauth/authorize?") && !next.includes("\\") ? next : "/teacher";
}

// Student picks their name after their class code has been verified.
// Used directly as a form action, so it receives just the FormData.
//
// The class code IS the access control: a pupil may be signed in only by someone
// who entered *that pupil's* class code. We therefore re-check on the server that
// the chosen studentId belongs to the class whose code was submitted — never
// trust the studentId alone (SAFEGUARDING.md rules 4 & 8). Without this, a
// crafted post could impersonate any pupil (even one in another school) by id.
export async function studentLogin(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!studentId || !code) redirect("/login/student");

  const student = await db.student.findFirst({
    where: { id: studentId, class: { classCode: code } },
  });
  // Deny by default: the id must belong to the class whose code was entered.
  if (!student) redirect(`/login/student?code=${encodeURIComponent(code)}`);

  await createSession({ role: "STUDENT", studentId: student.id });
  redirect("/student");
}

export async function logout() {
  await destroySession();
  redirect("/");
}
