import { NextResponse } from "next/server";
import { headers } from "next/headers";

// ⚠️ TEMPORARY DIAGNOSTIC — REMOVE. Added 2026-07-17 to settle one question that
// can only be answered against the live Railway deployment: when a request
// arrives with a forged `X-Forwarded-For`, what does the app actually receive,
// and how many proxy hops did Railway's edge add?
//
// This decides whether `clientIp()` (src/lib/rateLimit.ts) — which today reads
// the LEFTMOST value of that header — is spoofable in production, and therefore
// whether EVERY rate limiter in the app (teacher login, family codes, and the
// planned class-code throttle) can be bypassed by setting a header.
//
// It is read-only: it echoes request metadata the caller already controls (their
// own forwarded chain) plus which entry the current logic would pick. No
// database, no children's data, no secrets. Gated behind a token so it is not a
// public endpoint even for the hour it exists, and it 404s without it.
//
// Delete this file the moment the question is answered.
const TOKEN = "1769126518de55d23188e643";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("k") !== TOKEN) {
    return new NextResponse("Not found", { status: 404 });
  }

  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const parts = xff ? xff.split(",").map((s) => s.trim()) : [];

  return NextResponse.json({
    note: "diagnostic — how Railway presents X-Forwarded-For to the app",
    xForwardedFor_raw: xff,
    xForwardedFor_parts: parts,
    hopCount: parts.length,
    leftmost: parts[0] ?? null, // what clientIp() picks today — attacker-set if Railway appends
    rightmost: parts[parts.length - 1] ?? null, // the hop Railway's own edge added
    xRealIp: h.get("x-real-ip"),
  });
}
