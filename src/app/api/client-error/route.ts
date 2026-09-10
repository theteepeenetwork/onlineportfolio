import { NextRequest } from "next/server";
import { allowWithinBudget, clientIp } from "@/lib/rateLimit";
import { REPORT_MAX_BYTES, formatReportLine, sanitiseReport } from "@/lib/clientErrorReport";

// Browser-side failure reports (FINDINGS F74). A route handler rather than a
// Server Action because `navigator.sendBeacon` cannot call an action, and a
// beacon is the only thing guaranteed to leave a page that is dying.
//
// It answers 204 with an empty body to EVERYTHING: a good report, a bad one, an
// oversized one, one over budget. There is nothing to echo, so nothing can be
// reflected; there is no session check, because a broken session may be the
// very thing being reported; and it writes nothing anywhere but stdout, one
// fixed-alphabet line assembled from validated tokens (see
// src/lib/clientErrorReport.ts). The body is read as text, not JSON, because
// the client sends `text/plain` to avoid a preflight.
//
// The per-IP budget is a brake, not a wall: a school is one NAT IP (F16), so an
// over-budget report is dropped silently and the next window starts fresh.
// Nothing here can lock a classroom out of anything.
const BUDGET_MAX = 200;
const BUDGET_WINDOW_MS = 10 * 60 * 1000;

function empty() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > REPORT_MAX_BYTES) return empty();

  let text: string;
  try {
    text = await req.text();
  } catch {
    return empty();
  }
  if (text.length > REPORT_MAX_BYTES) return empty();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return empty();
  }

  if (!allowWithinBudget(`client-error:${await clientIp()}`, BUDGET_MAX, BUDGET_WINDOW_MS)) {
    return empty();
  }

  const report = sanitiseReport(parsed);
  if (report) console.warn(formatReportLine(report));
  return empty();
}
