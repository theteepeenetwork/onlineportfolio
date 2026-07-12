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

// Best-effort client identifier from proxy headers (Railway sets these). Falls
// back to a constant so the limiter still works locally. Never used for storage
// of personal data — only as a throttling key.
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "local";
}

// The friendly message shown when throttled — plain English, no jargon.
export const RATE_LIMITED_MESSAGE =
  "Too many attempts just now. Please wait a few minutes and try again.";
