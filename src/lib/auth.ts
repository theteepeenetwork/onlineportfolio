import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const COOKIE_NAME = "portfolio_session";
const SESSION_DAYS = 30;

// A logged-in teacher, resolved from the session cookie.
export type TeacherSession = {
  role: "TEACHER";
  teacher: { id: string; name: string; email: string };
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
  };
};

export type CurrentUser = TeacherSession | StudentSession | null;

// Create a session row + set the cookie. Called after a successful login.
export async function createSession(
  who: { role: "TEACHER"; teacherId: string } | { role: "STUDENT"; studentId: string },
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
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
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
        email: session.teacher.email,
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
      },
    };
  }

  return null;
}

// Delete the current session and clear the cookie.
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  cookieStore.delete(COOKIE_NAME);
}
