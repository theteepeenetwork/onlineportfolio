import { test, expect } from "@playwright/test";
import { isPublicSite, PUBLIC_SITE_HOSTS } from "../../../src/lib/indexability";

// ===========================================================================
// Non-public deployments must not be indexed
//
// StoryJar runs on more than one address. storyjar.co.uk is the product; the
// Railway staging environment is fixture schools, fixture children's work and
// an operator door whose password and TOTP secret are committed to this public
// repository on purpose. A search engine that indexes staging turns the second
// into a signposted door.
//
// The predicate is asserted directly rather than only through the served file,
// because the direction it fails in is the whole design: de-indexing the live
// site would be worse than the problem being fixed.
// ===========================================================================

test("the public site is treated as indexable", () => {
  for (const host of PUBLIC_SITE_HOSTS) {
    expect(isPublicSite(`https://${host}`), host).toBe(true);
  }
  expect(isPublicSite("https://storyjar.co.uk/")).toBe(true);
});

test("a staging or preview address is not", () => {
  expect(isPublicSite("https://onlineportfolio-staging.up.railway.app")).toBe(false);
  expect(isPublicSite("https://onlineportfolio-production-26ae.up.railway.app")).toBe(false);
  // A lookalike host must not pass. Substring matching would let this through.
  expect(isPublicSite("https://storyjar.co.uk.example.com")).toBe(false);
  expect(isPublicSite("https://staging.storyjar.co.uk")).toBe(false);
});

test("an absent or unparseable APP_URL fails towards indexing, never away from it", () => {
  // next.config.ts calls this at BUILD time, where the variable may be missing.
  // Answering "not public" there would put noindex on storyjar.co.uk.
  expect(isPublicSite(undefined)).toBe(true);
  expect(isPublicSite("")).toBe(true);
  expect(isPublicSite("not a url")).toBe(true);
});

test("robots.txt is served and names no path", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain("User-Agent: *");

  // Load-bearing: next.config.ts keeps /ops out of the index with a header
  // rather than a robots.txt entry, precisely so the path is not published to
  // anyone who fetches this file. A disallow here must stay path-free.
  expect(body).not.toContain("/ops");
});
