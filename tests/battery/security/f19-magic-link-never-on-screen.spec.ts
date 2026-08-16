import { test, expect } from "@playwright/test";
import { signInLinkMayBeShown } from "@/lib/signInLinkPolicy";

// ===========================================================================
// F19 — a parent's sign-in link must never be returned to the browser in
// production
//
// `requestMagicLink` used to mint a single-use token and return its URL in the
// action's response, which `FamilySignIn.tsx` rendered as "Open it now →".
// There was no environment guard anywhere in that path. On a live site that
// means:
//
//     type any parent's email into the PUBLIC family sign-in form
//       → receive a working sign-in link on screen
//       → open it, and you are signed in as that parent, looking at that
//         child's photographs, drawings and voice notes.
//
// No request tampering and no guessing — just a form submission with an address
// someone knows. That makes it more reachable than F1 or F15, and it breaks
// rule 4 (scope by ownership) and rule 6 (parents see only their own children)
// outright. It also quietly defeats F6: the copy is careful never to reveal
// WHETHER an address is on file, while handing over a sign-in link that answers
// the question far more emphatically.
//
// The fix emails the link and gates the on-screen version behind
// `signInLinkMayBeShown()`. That decision is a pure function of the environment
// precisely so it can be asserted here, rather than living as an `if` buried in
// a server action where no gate can see it.
//
// This is a BLOCKING test. If it fails, a production build is one deploy away
// from giving any visitor access to any family's account.
// ===========================================================================

test("a sign-in link is NEVER shown on screen in production [F19]", () => {
  expect(
    signInLinkMayBeShown("production"),
    "production must never return a magic link to the browser",
  ).toBe(false);
});

test("the development affordance still works everywhere else [F19]", () => {
  // Local development has no mail server, so the link stays on screen there —
  // that convenience is the whole reason the original code existed.
  expect(signInLinkMayBeShown("development")).toBe(true);
  expect(signInLinkMayBeShown("test")).toBe(true);
});

test("an unset NODE_ENV is treated as non-production, and that is deliberate [F19]", () => {
  // Fail-safe direction is arguable here, so it is stated rather than assumed:
  // Next.js always sets NODE_ENV, and `next build`/`next start` set it to
  // "production". An unset value therefore means a local script or a test
  // runner, never a live deployment. Were this ever to become reachable in a
  // real deployment, this expectation is the line to change first.
  expect(signInLinkMayBeShown(undefined)).toBe(true);
});
