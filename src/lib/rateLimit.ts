import "server-only";
import { headers } from "next/headers";

// Lightweight, dependency-free rate limiting for the auth surfaces (login,
// family-code sign-in, magic-link requests) — FINDINGS F2. It uses a
// failure/attempt-count model: wrong attempts accumulate per key and a
// successful sign-in CLEARS the count, so a busy classroom of legitimate logins
// is never locked out — only repeated failures from one source are throttled.
//
// Storage is in-process. On a single instance (the current deployment) that is
// sufficient; if Storyjar scales to multiple instances, swap this Map for a
// shared store (e.g. a small Prisma table or Redis) behind the same interface.
// SAFEGUARDING.md rule 13 (auth hardening).

type Entry = { fails: number; firstAt: number; blockedUntil: number };

const store = new Map<string, Entry>();

// After MAX_FAILS failed attempts inside WINDOW_MS, block for BLOCK_MS.
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

// Occasionally drop stale entries so the Map can't grow unbounded.
function sweep(now: number) {
  if (store.size < 5000) return;
  for (const [k, e] of store) {
    if (e.blockedUntil < now && e.firstAt + WINDOW_MS < now) store.delete(k);
  }
}

// Is this key currently blocked? (Checked at the start of an attempt.)
export function isRateLimited(key: string): boolean {
  const e = store.get(key);
  if (!e) return false;
  return e.blockedUntil > Date.now();
}

// Record a failed/undesirable attempt. Trips a block once the threshold is hit.
export function recordFailure(key: string): void {
  const now = Date.now();
  sweep(now);
  const e = store.get(key);
  if (!e || e.firstAt + WINDOW_MS < now) {
    store.set(key, { fails: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  e.fails += 1;
  if (e.fails >= MAX_FAILS) {
    e.blockedUntil = now + BLOCK_MS;
    e.fails = 0;
    e.firstAt = now;
  }
}

// Clear the counter after a legitimate success, so honest users are never
// throttled by their own earlier typos.
export function clearFailures(key: string): void {
  store.delete(key);
}

// Client identifier from proxy headers, used only as a throttling key — never
// stored, never personal data.
//
// The LEFTMOST value is deliberate and verified safe on this deployment. The
// usual danger with `x-forwarded-for` is that an edge which APPENDS to a
// client-supplied header leaves the attacker's value leftmost, so anyone can
// mint a fresh throttle key per request by setting the header. That is NOT how
// Railway behaves here.
//
// Verified against the live edge (2026-07-17, via a temporary diagnostic route,
// since removed). A request arriving with a forged `X-Forwarded-For: 1.1.1.1,
// 2.2.2.2` reached the app as `<real client IP>, <railway internal hop>` — the
// forged chain discarded entirely. So:
//   • leftmost  = the true client IP (also mirrored in `x-real-ip`) — correct.
//   • rightmost = Railway's internal hop, which ROTATES between requests
//                 (.1 / .4 / .2 seen across three calls) — keying on it would
//                 throw unrelated clients together and break the limiter.
//
// Do NOT "harden" this to the rightmost value: on this infrastructure that is a
// regression, not a fix. If the hosting edge ever changes, re-verify before
// touching this line. See FINDINGS.md F16.
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "local";
}

// The friendly message shown when throttled — plain English, no jargon.
export const RATE_LIMITED_MESSAGE =
  "Too many attempts just now. Please wait a few minutes and try again.";
