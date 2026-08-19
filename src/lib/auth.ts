import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { resolveAgeMode, type AgeMode } from "@/lib/ageMode";
import { errorLabel } from "@/lib/safeLog";

export const COOKIE_NAME = "portfolio_session";
const SESSION_DAYS = 30;

// A logged-in teacher, resolved from the session cookie.
export type TeacherSession = {
  role: "TEACHER";
  teacher: {
    id: string;
    name: string;
    displayName: string;
    email: string;
    staffRole: string; // ADMIN | TEACHER | TA — position within the school
    schoolId: string | null;
  };
};

// A logged-in student, resolved from the session cookie.
export type StudentSession = {
  role: "STUDENT";
  student: {
    id: string;
    name: string;
    avatarColor: string;
    classId: string;
    className: string;
    // Which child-facing register this student's class shows (SJ-06). Already
    // resolved (never NULL) so every student surface can read it off the session
    // and pass it to studentCopy() without another query.
    ageMode: AgeMode;
  };
};

export type CurrentUser = TeacherSession | StudentSession | null;

// Create a session row + set the cookie. Called after a successful login.
export async function createSession(
  who:
    | { role: "TEACHER"; teacherId: string }
    | { role: "STUDENT"; studentId: string }
    | { role: "PARENT"; parentId: string },
) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      token,
      role: who.role,
      expiresAt,
      teacherId: who.role === "TEACHER" ? who.teacherId : null,
      studentId: who.role === "STUDENT" ? who.studentId : null,
      parentId: who.role === "PARENT" ? who.parentId : null,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // In production the site is HTTPS-only; set Secure explicitly so the session
    // cookie can never ride an http request (SAFEGUARDING.md rule 13).
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

// Read the session cookie and resolve the current teacher or student.
export async function getCurrentUser(): Promise<CurrentUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: {
      teacher: true,
      student: { include: { class: true } },
    },
  });

  if (!session || session.expiresAt < new Date()) return null;

  if (session.role === "TEACHER" && session.teacher) {
    return {
      role: "TEACHER",
      teacher: {
        id: session.teacher.id,
        name: session.teacher.name,
        // Fall back to the first word of the full name for any teacher created
        // before displayName was captured.
        displayName: session.teacher.displayName || session.teacher.name.split(" ")[0],
        email: session.teacher.email,
        staffRole: session.teacher.role,
        schoolId: session.teacher.schoolId,
      },
    };
  }

  if (session.role === "STUDENT" && session.student) {
    return {
      role: "STUDENT",
      student: {
        id: session.student.id,
        name: session.student.name,
        avatarColor: session.student.avatarColor,
        classId: session.student.classId,
        className: session.student.class.name,
        ageMode: resolveAgeMode(session.student.class.ageMode),
      },
    };
  }

  return null;
}

// Delete the current session and clear the cookie.
//
// The cookie goes FIRST, and goes whatever the database does. It is the only
// thing keeping this browser signed in, so a failed write must never be the
// reason a child on a shared classroom device walks away still signed in —
// SAFEGUARDING.md, on error: deny. Clearing it first also means sign-out cannot
// throw before it has done the part that actually protects the next child.
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  cookieStore.delete(COOKIE_NAME);

  if (token) {
    try {
      await db.session.deleteMany({ where: { token } });
    } catch (err) {
      // The row now outlives the cookie until it expires. That is the lesser
      // harm, but it is still a fault worth seeing: an unwritable database
      // means sessions stop being revoked server-side. errorLabel keeps the
      // rejected Prisma argument — which carries the session credential — out
      // of the log store (rule 8).
      console.error("[auth] session row not deleted on sign-out", errorLabel(err));
    }
  }
}
