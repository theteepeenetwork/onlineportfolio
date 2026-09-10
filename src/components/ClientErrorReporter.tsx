"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { browserFamily, locationOf, routePattern, type ClientErrorKind, type ClientErrorReport } from "@/lib/clientErrorReport";

// Sends a browser-side failure to /api/client-error (FINDINGS F74). Renders
// nothing. Mounted once in the student and teacher layouts, so every canvas
// surface is covered without touching the root layout.
//
// Three things it can see:
//  - an uncaught error (`window` "error");
//  - an unhandled promise rejection;
//  - a page that ended WITHOUT unloading. `pagehide` fires on every clean exit
//    (navigate, reload, close, back-forward cache) and clears the marker; an
//    iPad killing the tab for memory fires nothing. So a marker still present
//    when the next document mounts means the previous one died. A person's own
//    refresh clears the marker first, so it is never counted.
//
// What leaves the device is the report type in src/lib/clientErrorReport.ts
// and nothing else: no message, no query string, no id. A page load may send at
// most MAX_PER_LOAD reports, and the same name at the same place is sent at
// most once every THROTTLE_MS, so a tight loop cannot flood the log.

const ALIVE_KEY = "sj-alive";
const MAX_PER_LOAD = 5;
const THROTTLE_MS = 30_000;

let sentThisLoad = 0;
const lastSent = new Map<string, number>();
// One id per DOCUMENT (this module is evaluated once per page load). The marker
// carries it so a document can tell its own marker from a dead predecessor's:
// React's development mode runs a mount effect twice, and without this the
// second run would read the first run's marker and report a death that never
// happened.
const DOC_ID = Math.random().toString(36).slice(2);

function navType(): string {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.type ?? "other";
  } catch {
    return "other";
  }
}

function send(partial: { kind: ClientErrorKind; name: string; where: string; route?: string }) {
  try {
    if (sentThisLoad >= MAX_PER_LOAD) return;
    const dedupeKey = `${partial.name}|${partial.where}`;
    const now = Date.now();
    const last = lastSent.get(dedupeKey) ?? 0;
    if (now - last < THROTTLE_MS) return;
    lastSent.set(dedupeKey, now);
    sentThisLoad += 1;

    const report: ClientErrorReport = {
      kind: partial.kind,
      name: partial.name,
      where: partial.where,
      route: partial.route ?? routePattern(window.location.pathname),
      ua: browserFamily(navigator.userAgent),
      nav: navType(),
    };
    const body = JSON.stringify(report);
    // A string body goes as text/plain, which keeps the beacon a simple
    // request (no preflight); the route parses the text itself. A string
    // rather than a Blob so the body is readable by the tests that watch it.
    if (typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon("/api/client-error", body)) return;
    }
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    });
  } catch {
    /* a reporter must never itself be a reason a page fails */
  }
}

function nameOf(e: unknown, fallback: string): string {
  const n = (e as { name?: unknown } | null)?.name;
  return typeof n === "string" && n ? n : fallback;
}

function stackOf(e: unknown): string | undefined {
  const s = (e as { stack?: unknown } | null)?.stack;
  return typeof s === "string" ? s : undefined;
}

// For an error boundary: it has the error object and nothing else.
export function reportClientError(error: unknown, kind: ClientErrorKind) {
  send({ kind, name: nameOf(error, "Error"), where: locationOf(undefined, undefined, undefined, stackOf(error)) });
}

function writeAlive(route: string) {
  try {
    sessionStorage.setItem(ALIVE_KEY, JSON.stringify({ route, at: Date.now(), doc: DOC_ID }));
  } catch {
    /* storage unavailable: no marker, no detection, nothing else changes */
  }
}

export function ClientErrorReporter() {
  const pathname = usePathname();

  // Document lifetime: runs once per page load.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(ALIVE_KEY);
      const prev = raw ? (JSON.parse(raw) as { route?: unknown; doc?: unknown }) : null;
      if (prev && prev.doc !== DOC_ID) {
        send({
          kind: "unclean-exit",
          name: "UncleanExit",
          where: "session",
          route: typeof prev.route === "string" ? prev.route : "other",
        });
      }
    } catch {
      /* a malformed marker is simply replaced below */
    }
    writeAlive(routePattern(window.location.pathname));

    const onError = (e: ErrorEvent) => {
      send({
        kind: "error",
        name: nameOf(e.error, "Error"),
        where: locationOf(e.filename, e.lineno, e.colno, stackOf(e.error)),
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      send({
        kind: "rejection",
        name: nameOf(e.reason, "UnhandledRejection"),
        where: locationOf(undefined, undefined, undefined, stackOf(e.reason)),
      });
    };
    const onHide = () => {
      try {
        sessionStorage.removeItem(ALIVE_KEY);
      } catch {
        /* nothing to clear */
      }
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Client navigation: the marker names the page that was on screen when the
  // tab died, not the one the document was opened on.
  useEffect(() => {
    if (pathname) writeAlive(routePattern(pathname));
  }, [pathname]);

  return null;
}
