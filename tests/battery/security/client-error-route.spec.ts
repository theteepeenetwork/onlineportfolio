import { test, expect } from "@playwright/test";
import { clearSession, ownThrottleKey } from "../helpers";
import { formatReportLine, routePattern, sanitiseReport, locationOf, browserFamily } from "@/lib/clientErrorReport";

// ===========================================================================
// A20 — the browser-error beacon says nothing but its six words
//
// FINDINGS F74. `/api/client-error` is the one route a page may call while it
// is dying, and it is reachable with no session. So the thing to prove is not
// that it works but that it cannot be made to do anything else: it never
// answers with a body, never sets a cookie, never writes anywhere but stdout,
// and what reaches stdout is assembled from validated tokens, never from the
// text a browser sent. The pure functions are tested directly, as the
// log-hygiene spec tests `errorLabel`.
// ===========================================================================

const ID = "cmtjxz1kq003cnu3x5qfixyu9";

test.describe("A20: the client-error beacon", () => {
  test("a route pattern replaces ids and drops the query", () => {
    expect(routePattern(`/student/activities/${ID}?draft=1#x`)).toBe("/student/activities/:id");
    expect(routePattern(`/teacher/students/${ID}/new`)).toBe("/teacher/students/:id/new");
    expect(routePattern("/student/new/drawing")).toBe("/student/new/drawing");
    expect(routePattern("/")).toBe("/");
    // Outside the app's own areas, or with characters that are not a path.
    expect(routePattern("/ops/sign-in")).toBe("other");
    expect(routePattern("/student/a b")).toBe("other");
    // An over-long path is cut at 80 characters, not refused: it is still a
    // route, and the cap is what bounds the line.
    expect(routePattern("/student/" + "x".repeat(200)).length).toBeLessThanOrEqual(80);
  });

  test("a location is a file and a line, never a URL with its query", () => {
    expect(locationOf("https://storyjar.co.uk/_next/static/chunks/app/student/page-abc.js?v=1", 12, 34)).toBe(
      "app/student/page-abc.js:12:34", // the last three segments, no host, no query
    );
    const stack = "TypeError: x\n    at fn (https://storyjar.co.uk/_next/static/chunks/main-app.js:5:6)";
    expect(locationOf(undefined, undefined, undefined, stack)).toBe("static/chunks/main-app.js:5:6");
    expect(locationOf(undefined, undefined, undefined, "nothing useful")).toBe("unknown");
    expect(locationOf("https://x/y?code=SUN234&family=FAM123")).not.toContain("SUN234");
  });

  test("a browser is a family and a major version", () => {
    expect(
      browserFamily(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
      ),
    ).toBe("Safari/17");
    expect(browserFamily("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36")).toBe(
      "Chrome/152",
    );
    expect(browserFamily("python-httpx/0.28.1")).toBe("other");
  });

  test("sanitiseReport keeps six validated fields and nothing else", () => {
    const r = sanitiseReport({
      kind: "error",
      name: "TypeError",
      where: "chunks/app/page-abc.js:12:34",
      route: `/student/activities/${ID}`,
      ua: "Safari/17",
      nav: "reload",
      message: "Amara's code SUN234 parent@example.com",
      stack: "at secret",
    });
    expect(r).toEqual({
      kind: "error",
      name: "TypeError",
      where: "chunks/app/page-abc.js:12:34",
      route: "/student/activities/:id",
      ua: "Safari/17",
      nav: "reload",
    });
    // Anything that fails its alphabet becomes "other"; a wrong shape is refused.
    const bad = sanitiseReport({ kind: "error", name: "Amara Okonkwo", where: "x".repeat(200), route: "javascript:alert(1)", ua: "<script>", nav: "?" });
    expect(bad).toEqual({ kind: "error", name: "other", where: "other", route: "other", ua: "other", nav: "other" });
    expect(sanitiseReport({ kind: "nonsense" })).toBeNull();
    expect(sanitiseReport("a string")).toBeNull();
    expect(sanitiseReport(null)).toBeNull();
    expect(sanitiseReport([1, 2])).toBeNull();
  });

  test("the stdout line is a fixed alphabet and never the input", () => {
    const smuggled = "Amara parent@example.com SUN234";
    const r = sanitiseReport({ kind: "rejection", name: smuggled, where: smuggled, route: smuggled, ua: smuggled, nav: smuggled })!;
    const line = formatReportLine(r);
    expect(line).toMatch(/^\[client-error\]( [a-z]+=[A-Za-z0-9_./:\-\[\]]+)+$/);
    expect(line).not.toContain("@");
    expect(line).not.toContain("Amara");
    expect(line).not.toContain("SUN234");
    expect(line).toBe("[client-error] kind=rejection name=other where=other route=other ua=other nav=other");
  });

  test("the route answers 204 with nothing, with no session, whatever it is sent", async ({ page }) => {
    await clearSession(page);
    const headers = { ...ownThrottleKey("cerr"), "content-type": "text/plain" };
    const good = JSON.stringify({ kind: "error", name: "TypeError", where: "chunks/app/page.js:1:2", route: "/student", ua: "Safari/17", nav: "navigate" });

    const ok = await page.request.post("/api/client-error", { headers, data: good, failOnStatusCode: false });
    expect(ok.status()).toBe(204);
    expect(await ok.text()).toBe("");
    expect(ok.headers()["set-cookie"]).toBeUndefined();

    const cases: Array<[string, string]> = [
      ["oversized", "x".repeat(3000)],
      ["not JSON", "<html>"],
      ["a JSON array", "[1,2,3]"],
      ["a report carrying a child's name and code", JSON.stringify({ kind: "error", name: "Amara", message: "Amara's code SUN234", where: "/family?token=abc" })],
    ];
    for (const [label, body] of cases) {
      const res = await page.request.post("/api/client-error", { headers, data: body, failOnStatusCode: false });
      expect(res.status(), `${label} → status`).toBe(204);
      expect(await res.text(), `${label} → body`).toBe("");
    }

    const get = await page.request.get("/api/client-error", { failOnStatusCode: false });
    expect(get.status()).not.toBe(200);
  });

  test("over budget is a quiet drop, never a wall", async ({ page }) => {
    // A school is one NAT IP (F16). Two hundred reports in ten minutes is the
    // budget; the report after it is dropped and the page is told nothing —
    // no 429, no 5xx, nothing a classroom could notice.
    await clearSession(page);
    const headers = { ...ownThrottleKey("cerrflood"), "content-type": "text/plain" };
    const body = JSON.stringify({ kind: "error", name: "TypeError", where: "a.js:1:1", route: "/student", ua: "Safari/17", nav: "navigate" });
    const statuses = new Set<number>();
    for (let i = 0; i < 205; i++) {
      const res = await page.request.post("/api/client-error", { headers, data: body, failOnStatusCode: false });
      statuses.add(res.status());
    }
    expect([...statuses]).toEqual([204]);
  });
});
