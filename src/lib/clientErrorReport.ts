// The shape of a browser-side failure report, and the only things one may say.
//
// Why this exists (FINDINGS F74): on 10 September 2026 a class of iPads lost the
// drawing canvas over and over, a refresh brought it back each time, and the
// server saw nothing. StoryJar had no browser-side error reporting at all,
// because SAFEGUARDING rule 11 forbids third-party error tracking on a child's
// surface. This is the first-party answer, and it is deliberately narrow.
//
// What a report carries: an error CLASS name, a code LOCATION, a route PATTERN
// (ids replaced), a browser FAMILY and major version, how the page was
// navigated to, and which kind of failure it was. What it never carries: the
// error message, the URL's query string, any id, any name, any address. The
// type has no `message` field, so there is nothing to forget to strip.
//
// Every field is validated against a closed alphabet on the way in and anything
// that fails becomes "other". That is what lets the stdout line be provably
// free of contents (see src/lib/safeLog.ts for the rule: ids, counts and fixed
// phrases, never contents). Pure functions, no `server-only`, so the security
// battery can import them directly.

export type ClientErrorKind = "error" | "rejection" | "boundary" | "unclean-exit";

export type ClientErrorReport = {
  kind: ClientErrorKind;
  name: string; // an error class name, e.g. TypeError
  where: string; // a code location: chunk file and line, never a URL with a query
  route: string; // a route PATTERN, e.g. /student/activities/:id
  ua: string; // browser family and major only, e.g. Safari/17
  nav: string; // how this document was reached: navigate | reload | back_forward
};

// The largest body the route will read. A real report is ~200 bytes; anything
// bigger is not one of ours.
export const REPORT_MAX_BYTES = 2048;

const KINDS = new Set<string>(["error", "rejection", "boundary", "unclean-exit"]);
const NAVS = new Set<string>(["navigate", "reload", "back_forward", "prerender", "other"]);
const NAME_RE = /^[A-Za-z][A-Za-z0-9]{0,59}$/;
const WHERE_RE = /^[A-Za-z0-9_.\-\[\]/]{1,120}(:\d{1,6}){0,2}$/;
const ROUTE_RE = /^\/[A-Za-z0-9_\-/:.]{0,80}$/;
const ROUTE_ROOTS = ["/student", "/teacher", "/admin", "/family", "/login", "/signup"];
// A cuid, which is what every id in this app looks like.
const ID_SEGMENT_RE = /^c[a-z0-9]{24}$/;

// "/student/activities/cmtjxz1kq003cnu3x5qfixyu9?x=1" → "/student/activities/:id".
export function routePattern(pathname: string): string {
  const path = String(pathname ?? "").split("?")[0].split("#")[0];
  if (path === "/") return "/";
  const parts = path
    .split("/")
    .map((seg) => (ID_SEGMENT_RE.test(seg) ? ":id" : seg))
    .join("/")
    .slice(0, 80);
  if (!ROUTE_RE.test(parts)) return "other";
  if (!ROUTE_ROOTS.some((root) => parts === root || parts.startsWith(root + "/"))) return "other";
  return parts;
}

// The last path segment of a script URL, without its query, plus line:column.
// Falls back to the first frame of a stack, then to "unknown".
export function locationOf(filename?: string, line?: number, col?: number, stack?: string): string {
  const fromFile = fileTail(filename);
  if (fromFile) {
    const pos = [line, col]
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0)
      .map((n) => Math.min(Math.floor(n), 999999));
    return clamp(pos.length ? `${fromFile}:${pos.join(":")}` : fromFile);
  }
  const frame = firstFrame(stack);
  return frame ? clamp(frame) : "unknown";
}

function fileTail(url: string | undefined): string | null {
  if (!url) return null;
  const clean = String(url).split("?")[0].split("#")[0];
  const tail = clean.split("/").filter(Boolean).slice(-3).join("/");
  return tail && /^[A-Za-z0-9_.\-\[\]/]+$/.test(tail) ? tail : null;
}

function firstFrame(stack: string | undefined): string | null {
  if (!stack) return null;
  // "    at fn (https://host/_next/static/chunks/app/page-abc.js:12:34)"
  const m = String(stack).match(/\(?((?:https?:\/\/[^\s()]+|\/)[^\s()]*?):(\d+):(\d+)\)?/);
  if (!m) return null;
  const tail = fileTail(m[1]);
  return tail ? `${tail}:${m[2]}:${m[3]}` : null;
}

function clamp(where: string): string {
  return WHERE_RE.test(where) ? where : "unknown";
}

// Browser family and major version only. A desktop-mode iPad still says Safari.
export function browserFamily(ua: string): string {
  const s = String(ua ?? "");
  const pick = (label: string, re: RegExp) => {
    const m = s.match(re);
    return m ? `${label}/${m[1]}` : null;
  };
  return (
    pick("Edge", /\bEdg(?:e|A|iOS)?\/(\d+)/) ??
    pick("Firefox", /\bFirefox\/(\d+)/) ??
    pick("Chrome", /(?:Chrome|CriOS)\/(\d+)/) ??
    pick("Safari", /\bVersion\/(\d+)[^ ]* .*Safari\//) ??
    "other"
  );
}

// Coerce and validate whatever arrived. Wrong shape → null; a field that fails
// its alphabet → "other". Nothing that is not one of the six fields survives.
export function sanitiseReport(input: unknown): ClientErrorReport | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const b = input as Record<string, unknown>;
  const kind = String(b.kind ?? "");
  if (!KINDS.has(kind)) return null;
  const name = String(b.name ?? "");
  const where = String(b.where ?? "");
  const route = String(b.route ?? "");
  const ua = String(b.ua ?? "");
  const nav = String(b.nav ?? "");
  return {
    kind: kind as ClientErrorKind,
    name: NAME_RE.test(name) ? name : "other",
    where: WHERE_RE.test(where) ? where : "other",
    route: routePattern(route),
    ua: /^(Safari|Chrome|Firefox|Edge)\/\d{1,4}$/.test(ua) ? ua : "other",
    nav: NAVS.has(nav) ? nav : "other",
  };
}

// One fixed-alphabet line for stdout. Every value has already passed its regex.
export function formatReportLine(r: ClientErrorReport): string {
  return `[client-error] kind=${r.kind} name=${r.name} where=${r.where} route=${r.route} ua=${r.ua} nav=${r.nav}`;
}
