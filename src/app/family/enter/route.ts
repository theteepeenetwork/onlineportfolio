import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { COOKIE_NAME } from "@/lib/auth";

const SESSION_DAYS = 30;

// The target of a parent "magic link". Validates the single-use token, signs the
// parent in, and sends them to their family home. Invalid/expired/used tokens
// fall back to the sign-in screen with a gentle flag. The session cookie is set
// on the redirect response directly (route handlers don't persist a cookie set
// via next/headers on a redirect).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const base = req.nextUrl.origin;

  const record = token ? await db.magicToken.findUnique({ where: { token } }) : null;
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.redirect(`${base}/family?expired=1`);
  }

  await db.magicToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: { token: sessionToken, role: "PARENT", parentId: record.parentId, expiresAt },
  });

  const res = NextResponse.redirect(`${base}/family`);
  res.cookies.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return res;
}
