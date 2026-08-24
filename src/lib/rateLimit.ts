import "server-only";
import { headers } from "next/headers";

// Lightweight, dependency-free rate limiting for the auth surfaces (login,
// family-code sign-in, magic-link requests) — FINDINGS F2. It uses a
// failure/attempt-count model: wrong attempts accumulate per key and a
// successful sign-in CLEARS the count, so a busy classroom of legitimate logins
// is never locked out — only repeated failures from one source are throttled.
//
// Storage is in-process. On a single instance (the current deployment) that is
// sufficient; if StoryJar scales to multiple instances, swap this Map for a
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

// ---------------------------------------------------------------------------
// The class-code lookup throttle — FINDINGS F16.
//
// `/login/student?code=…` resolves the class code in a plain GET, and a hit
// discloses the class name plus every pupil's first name. 31^6 ≈ 887M codes
// makes blind brute force impractical, but the lookup is otherwise unbounded:
// an attacker can grind it. This throttles that grind WITHOUT ever locking a
// real classroom out — and that second half is the hard part.
//
// The trap (see AGENTS.md / the audit): **a school is one NAT IP.** Thirty
// children mistyping twice is 60 misses from a single IP. The auth limiter
// above (5 fails → hard block) would lock the whole school out of the front
// door. So this counter is deliberately different in three ways:
//
//   1. MISS-ONLY, and any HIT clears the count. A real classroom is a stream of
//      mostly-correct entries; every success resets the key, so honest misses
//      never accumulate toward the ceiling. Only a pure-miss source (an
//      attacker, or a wrong code on the board — which no child can satisfy
//      anyway) climbs.
//   2. A CLASSROOM-SIZED ceiling (CODE_MAX_MISSES), well above a plausible
//      burst of typos from one room.
//   3. Over the ceiling it TRICKLES rather than hard-blocks: one lookup per
//      CODE_TRICKLE_MS. A correct code is never refused for more than that
//      window, and the instant it lands it clears the block for everyone behind
//      the same IP. A hard block would deny a *correct* code mid-attack and
//      leave the class shut out — the exact failure this must not have.
//
// Keyed on clientIp() (verified un-spoofable on this edge — see below). The key
// is in-memory and never stored, so it starts no new data category (rule 9).
type CodeEntry = { misses: number; firstAt: number; lastAllowed: number };

const codeStore = new Map<string, CodeEntry>();

const CODE_MAX_MISSES = 50; // per window; a classroom clears long before this
const CODE_WINDOW_MS = 15 * 60 * 1000;
const CODE_TRICKLE_MS = 5_000; // over budget: at most one lookup per 5s per key

// May this key perform a class-code lookup right now? Returns false ONLY when
// the key is over its miss budget AND inside the trickle cooldown. Under budget
// it is always true, so a busy classroom is never gated.
export function allowCodeLookup(key: string): boolean {
  const now = Date.now();
  if (codeStore.size >= 5000) {
    for (const [k, e] of codeStore) {
      if (e.firstAt + CODE_WINDOW_MS < now) codeStore.delete(k);
    }
  }
  const e = codeStore.get(key);
  if (!e || e.firstAt + CODE_WINDOW_MS < now) {
    codeStore.set(key, { misses: 0, firstAt: now, lastAllowed: now });
    return true;
  }
  if (e.misses < CODE_MAX_MISSES) return true;
  // Over budget — trickle. Let one lookup through per cooldown; a correct code
  // getting through here clears the whole block via recordCodeHit().
  if (now - e.lastAllowed >= CODE_TRICKLE_MS) {
    e.lastAllowed = now;
    return true;
  }
  return false;
}

// A lookup that found no class. Counts toward the miss budget.
export function recordCodeMiss(key: string): void {
  const now = Date.now();
  const e = codeStore.get(key);
  if (!e || e.firstAt + CODE_WINDOW_MS < now) {
    codeStore.set(key, { misses: 1, firstAt: now, lastAllowed: now });
    return;
  }
  e.misses += 1;
}

// A lookup that found a class. Clears the key entirely — an honest classroom's
// successes keep it perpetually fresh, and one correct entry lifts a trickle.
export function recordCodeHit(key: string): void {
  codeStore.delete(key);
}

// ---------------------------------------------------------------------------
// The establishment search throttle.
// ---------------------------------------------------------------------------
//
// Different from both limiters above, because the thing being protected is
// different. The auth limiter guards a secret; the class-code limiter guards a
// code that discloses a classroom. This one guards NEITHER: the establishment
// register is the DfE's open data, published in full to anyone who asks for it,
// so there is nothing here to keep from an attacker and nothing to disclose by
// answering.
//
// What it guards is work. The search is the only unauthenticated endpoint in
// StoryJar that scans a twenty-thousand-row table, it runs while a teacher is
// typing, and it is reachable before any account exists. A budget stops one
// caller making the app do that for them all afternoon.
//
// So the shape is a plain budget, not a failure count — there is no such thing
// as a failed establishment search — and over budget it TRICKLES rather than
// blocking, for the reason the class-code limiter trickles: a school is one NAT
// IP, and a hard block would put a real teacher's signup into a dead end while
// they were halfway through typing their school's name.
//
// The ceiling is generous on purpose. With a 250ms debounce and a three
// character minimum, a teacher finding their school makes something like five
// to fifteen requests, so 120 in ten minutes is several teachers at one school
// signing up in the same sitting, and still far below what a scraper needs.
type SearchEntry = { hits: number; firstAt: number; lastAllowed: number };

const searchStore = new Map<string, SearchEntry>();

const SEARCH_MAX_HITS = 120;
const SEARCH_WINDOW_MS = 10 * 60 * 1000;
const SEARCH_TRICKLE_MS = 2_000;

/**
 * May this key run an establishment search right now? Counts the search as it
 * answers, so the caller does not have to remember to.
 */
export function allowEstablishmentSearch(key: string): boolean {
  const now = Date.now();
  if (searchStore.size >= 5000) {
    for (const [k, e] of searchStore) {
      if (e.firstAt + SEARCH_WINDOW_MS < now) searchStore.delete(k);
    }
  }
  const e = searchStore.get(key);
  if (!e || e.firstAt + SEARCH_WINDOW_MS < now) {
    searchStore.set(key, { hits: 1, firstAt: now, lastAllowed: now });
    return true;
  }
  if (e.hits < SEARCH_MAX_HITS) {
    e.hits += 1;
    return true;
  }
  // Over budget — trickle. Never a hard no, so a real teacher who has been
  // typing for a while waits two seconds rather than hitting a wall.
  if (now - e.lastAllowed >= SEARCH_TRICKLE_MS) {
    e.lastAllowed = now;
    return true;
  }
  return false;
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
