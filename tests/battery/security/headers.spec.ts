import { test, expect } from "@playwright/test";

// ===========================================================================
// A8 — Security headers & transport
//
// Assert the security headers on representative routes and FAIL if any regress
// (SAFEGUARDING.md rule 14). Values mirror next.config.ts. Where a value
// differs between dev and prod (CSP 'unsafe-eval', cookie Secure) the assertion
// is written to hold in dev while still catching a real regression.
// ===========================================================================

const ROUTES = ["/", "/login/teacher", "/login/student", "/family"];

for (const route of ROUTES) {
  test(`security headers present on ${route}`, async ({ page }) => {
    const res = await page.goto(route);
    expect(res, `no response for ${route}`).toBeTruthy();
    const h = res!.headers();

    // Content-Security-Policy — locked down, self-only, no framing.
    const csp = h["content-security-policy"] ?? "";
    expect(csp, "CSP missing").toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
    // No third-party origins should ever creep into connect-src (no trackers).
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/https?:\/\//); // no explicit external origins

    // HSTS — long max-age, subdomains, preload.
    const hsts = h["strict-transport-security"] ?? "";
    expect(hsts).toMatch(/max-age=\d{7,}/);
    expect(hsts).toContain("includeSubDomains");

    // Sniffing / framing / referrer / permissions / dns-prefetch.
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"] ?? "").toContain("geolocation=()");
    expect(h["permissions-policy"] ?? "").toContain("microphone=()");
    expect(h["x-dns-prefetch-control"]).toBe("off");
  });
}

test("media responses are private, non-cacheable and nosniff", async ({ page }) => {
  // Sign in as the demo teacher so an authorised media fetch returns 200 with
  // the hardened caching headers (a child's image must never hit a shared cache).
  await page.goto("/login/teacher");
  await page.fill("#email", "teacher@school.uk");
  await page.fill("#password", "password");
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === "/teacher");

  const res = await page.request.get("/uploads/seed-sun.svg");
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h["cache-control"]).toContain("no-store");
  expect(h["cache-control"]).toContain("private");
  expect(h["x-content-type-options"]).toBe("nosniff");
});
