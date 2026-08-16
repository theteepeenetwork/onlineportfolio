import { test, expect } from "@playwright/test";

// ===========================================================================
// OPS-0a: the public healthcheck at /api/health
//
// Railway calls this endpoint with no credentials before it moves traffic onto
// a new deployment, so it is unauthenticated by necessity and every byte of it
// is public. The rule the endpoint is built to (handbook R19):
//
//   the body is EXACTLY {"ok":true}, or a 503 carrying a fixed token from a
//   closed set.
//
// Nothing else. No version string, no commit SHA, no timestamp, no counts, no
// database contents, no environment values, and nothing that names the failing
// subsystem. An attacker who polls this endpoint must learn only "up" or "not
// up", and must not be able to watch a number move.
//
// Both directions are asserted here, in one describe block, on the same
// resource: the negatives below are worthless on their own, because a route
// that has stopped existing returns a 404 that contains no child's name either.
// The positive control is the first test: the endpoint really is serving and
// really does answer {"ok":true} while the app is healthy.
// ===========================================================================

const HEALTH = "/api/health";

// Everything the fixtures (prisma/seed-test.ts) put in the database that must
// never appear in a public response: children's first names, class codes,
// family codes and an adult email address.
const FIXTURE_SECRETS = [
  "Zara",
  "Yusuf",
  "Willow",
  "Ada",
  "Sunflower",
  "Oakfield",
  "SUN234",
  "ACRN22",
  "FAM123",
  "OAKFAM1",
  "teacher@school.uk",
];

test.describe("A17: the public healthcheck says only whether the app is up", () => {
  // ---- Positive control, on the same resource -----------------------------
  test("positive control: the endpoint is live and answers exactly {\"ok\":true}", async ({ request }) => {
    const res = await request.get(HEALTH);
    expect(res.status(), "healthcheck did not return 200: the app is not healthy, or the route is gone").toBe(200);
    // Exact body. Not "contains ok", not "parses to {ok:true}", but the literal
    // bytes, so an added field of any kind fails here first.
    expect(await res.text()).toBe('{"ok":true}');
  });

  test("the endpoint is reachable without any session", async ({ request }) => {
    // A fresh request context carries no cookies. Railway's prober has none
    // either, so a healthcheck that needs a session silently fails every deploy.
    const res = await request.get(HEALTH, { headers: { cookie: "" } });
    expect(res.status()).toBe(200);
  });

  // ---- Negatives ----------------------------------------------------------
  test("the body carries no version, commit, timestamp, count or environment value", async ({ request }) => {
    const body = await (await request.get(HEALTH)).text();

    // The strongest form of every assertion below is simply the exact body,
    // asserted again here so this test fails for its own reason rather than
    // relying on the control test above.
    expect(body).toBe('{"ok":true}');

    // Spelled out, so that a future relaxation of the exact-body assertion does
    // not quietly take these with it.
    expect(body, "a digit in the body means something is being counted or dated").not.toMatch(/\d/);
    expect(body.toLowerCase()).not.toContain("version");
    expect(body.toLowerCase()).not.toContain("commit");
    expect(body.toLowerCase()).not.toContain("sha");
    expect(body.toLowerCase()).not.toContain("uptime");
    expect(body.toLowerCase()).not.toContain("node");
    expect(body.toLowerCase()).not.toContain("prisma");
    expect(body.toLowerCase()).not.toContain("/data");
    expect(body.toLowerCase()).not.toContain("error");
    expect(body.toLowerCase()).not.toContain("stack");
  });

  test("the body carries no child name, class code, family code or address", async ({ request }) => {
    const body = await (await request.get(HEALTH)).text();
    for (const secret of FIXTURE_SECRETS) {
      expect(body, `healthcheck body leaked "${secret}"`).not.toContain(secret);
    }
  });

  test("nothing in the response varies between calls", async ({ request }) => {
    // A body that changes is a body carrying state, and state polled by anyone
    // on the internet is a signal about the school day. Two calls, byte-equal.
    const first = await (await request.get(HEALTH)).text();
    const second = await (await request.get(HEALTH)).text();
    expect(second).toBe(first);
  });

  test("the response is never cached and never indexed", async ({ request }) => {
    const res = await request.get(HEALTH);
    const cache = res.headers()["cache-control"] ?? "";
    expect(cache).toContain("no-store");
    expect(res.headers()["x-robots-tag"] ?? "").toContain("noindex");
  });

  test("the media probe file is not reachable through the authorising /uploads route", async ({ request }) => {
    // The deep check writes and unlinks a zero-byte file under
    // ${MEDIA_DIR}/.health/. It must be unreachable even if a run leaves one
    // behind: /uploads serves one flat segment with a media extension, and only
    // when a database row the requester owns references it.
    for (const attempt of ["/uploads/.health/probe.tmp", "/uploads/probe.tmp", "/uploads/.health"]) {
      const res = await request.get(attempt);
      expect(res.status(), `${attempt} was served`).toBe(404);
    }
  });
});
