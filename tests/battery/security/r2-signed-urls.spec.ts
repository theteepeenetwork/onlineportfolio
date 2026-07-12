import { test, expect } from "@playwright/test";

// ===========================================================================
// A5 — Cloudflare R2 private bucket + signed URLs  (FORWARD-LOOKING)
//
// Media is currently stored on the local disk (.media/) and served through the
// authorising /uploads route. The roadmap moves media to a PRIVATE R2 bucket,
// served only via short-lived signed URLs scoped to an authorised viewer
// (SAFEGUARDING.md rule 7, and rule 10: UK/EU region only).
//
// These specs are written now and SKIPPED until R2 lands. The CI tripwire in
// scripts/check-r2-tripwire.mjs fails the build if R2 code appears in the repo
// while these are still skipped — so the tests can't be forgotten.
//
// When R2 ships: remove test.skip, wire R2_PUBLIC_BASE / a signer, and fill in
// the assertions marked TODO.
// ===========================================================================

const R2_ENABLED = !!process.env.R2_BUCKET; // flip on once configured

test.describe("A5 · R2 private bucket & signed URLs", () => {
  test.skip(!R2_ENABLED, "R2 not configured yet — see FINDINGS.md / TEST_PLAN.md A5");

  test("raw bucket objects are NOT publicly readable", async () => {
    // TODO(R2): fetch a known object via its direct bucket URL with no signature
    // and assert 401/403 (never 200). Objects must never be world-readable.
    expect(R2_ENABLED).toBe(true);
  });

  test("media is served only via short-lived signed URLs", async () => {
    // TODO(R2): request a child's media through the app as an authorised viewer;
    // assert the returned URL is signed and carries a short expiry (minutes).
    expect(R2_ENABLED).toBe(true);
  });

  test("a signed URL is scoped to the authorised viewer and expires", async () => {
    // TODO(R2): assert a signed URL minted for viewer A cannot be replayed after
    // expiry, and that an unauthorised viewer cannot mint one.
    expect(R2_ENABLED).toBe(true);
  });

  test("the R2 bucket region is UK/EU only", async () => {
    // TODO(R2): assert configured region ∈ {eu-*, uk-*} (rule 10 — data locality).
    expect(R2_ENABLED).toBe(true);
  });
});
