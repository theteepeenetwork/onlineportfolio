import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { MEDIA_DIR } from "@/lib/mediaPath";

// ---------------------------------------------------------------------------
// The deploy healthcheck. Railway calls this before it moves traffic onto a new
// deployment (`deploy.healthcheckPath` in railway.json), so a container that
// boots broken keeps serving nothing and the previous deployment stays live.
//
// IT IS PUBLIC AND UNAUTHENTICATED, by necessity: Railway's prober carries no
// cookie. So treat every byte of the response as published on the open
// internet. Handbook R19 fixes the contract:
//
//   200 -> the body is exactly {"ok":true}
//   503 -> the body is a fixed token from the closed set below
//
// and nothing else, ever. No version string, no commit SHA, no timestamp, no
// counts of schools or pupils or moments, no environment values, no stack
// trace, and no name for the subsystem that failed. Two reasons, both real:
//
//  1. Anything that varies is a signal. A counter visible to anyone who polls
//     this URL tells a stranger how many children are using Storyjar and when a
//     school day starts. SAFEGUARDING rules 4 and 5 do not stop applying
//     because the number is an aggregate.
//  2. Naming the broken subsystem tells an attacker which part of the stack to
//     push on. The detail goes to stdout, where only the operator sees it, and
//     even there it is a fixed phrase and never a row of data.
//
// What it checks, because an HTTP 200 from the homepage catches none of them:
//  - the process is serving,
//  - the database answers a trivial parameterised read,
//  - MEDIA_DIR is present and writable. A read-only or unmounted volume is
//    invisible from every other signal and stops a child saving their work.
//
// What it must never do: read a child row, call Stripe or the mail provider (an
// upstream outage must not make Railway kill a healthy container), write to the
// database, or require a session.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The closed set of 503 tokens. One member, deliberately.
 *
 * A new member may only be added if it is as uninformative as this one. It must
 * not name a subsystem, a file path, an error class or a status code: the point
 * of the set being closed is that the public body cannot grow a vocabulary that
 * describes the inside of the system.
 */
const DEGRADED = "degraded" as const;

/** How long a deep-check verdict is reused, in milliseconds. */
const CACHE_MS = 10_000;

// The endpoint is public and does a database read plus a filesystem write, so a
// flood would otherwise amplify into volume writes. One verdict is computed at
// most every CACHE_MS and reused in between. This is the rate protection; the
// limiter in src/lib/rateLimit.ts is a per-key auth failure counter, not a route
// limiter, and wiring the healthcheck into it would risk it locking itself out.
let cached: { at: number; ok: boolean } | null = null;

/** The probe directory, kept out of the media tree itself. */
const PROBE_DIR = path.join(MEDIA_DIR, ".health");
const PROBE_FILE = path.join(PROBE_DIR, "probe.tmp");

async function databaseAnswers(): Promise<boolean> {
  try {
    // Parameterised tagged template. Reads no table and therefore no child row.
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    console.error("[health] database check failed");
    return false;
  }
}

async function mediaVolumeWritable(): Promise<boolean> {
  try {
    await mkdir(PROBE_DIR, { recursive: true });
    await writeFile(PROBE_FILE, "");
    return true;
  } catch {
    // Fixed phrase only. The path is a media path and the error object can
    // carry one too, so neither goes to stdout (OPS-0d log hygiene).
    console.error("[health] media volume check failed");
    return false;
  } finally {
    // Unlinked on every path, including failure, so a wedged volume cannot
    // accumulate probe files. A missing file here is the expected outcome when
    // the write itself failed.
    await unlink(PROBE_FILE).catch(() => {});
  }
}

async function deepCheck(): Promise<boolean> {
  const [dbOk, mediaOk] = await Promise.all([databaseAnswers(), mediaVolumeWritable()]);
  return dbOk && mediaOk;
}

// no-store keeps the verdict out of any shared cache, so Railway never reads a
// stale "up" for a container that has since fallen over. noindex keeps a public
// endpoint out of search results.
const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store, max-age=0, must-revalidate",
  "x-robots-tag": "noindex, nofollow, noarchive",
} as const;

export async function GET(): Promise<Response> {
  const now = Date.now();
  if (!cached || now - cached.at >= CACHE_MS) {
    cached = { at: now, ok: await deepCheck() };
  }

  // Written as literal bytes rather than JSON.stringify of an object, so that
  // "what does this endpoint return" is answerable by reading one line.
  return cached.ok
    ? new Response('{"ok":true}', { status: 200, headers: HEADERS })
    : new Response(`{"status":"${DEGRADED}"}`, { status: 503, headers: HEADERS });
}
