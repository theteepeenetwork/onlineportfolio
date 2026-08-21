import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/http";

// "Is this token working, and whose is it?" — the call a teacher makes to check
// they pasted the token correctly. Returns the teacher's own name and nothing
// else: no email, no school, no ids belonging to anybody but them.
export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ teacher: { name: auth.auth.teacher.displayName }, scope: "activities" });
}
