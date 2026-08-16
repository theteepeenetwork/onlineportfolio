// A parent's sign-in link may only be shown ON SCREEN outside production.
//
// This module exists, and is deliberately tiny and free of `server-only`, so
// that the rule can be imported and asserted directly by a test. It used to be
// an implicit `if` inside a server action, where no gate could see it — and
// before that it wasn't there at all.
//
// What it prevents (FINDINGS F19): `requestMagicLink` returns a single-use
// sign-in URL. If that URL reaches the browser, then anyone who types a
// parent's email address into the PUBLIC family sign-in form is handed a
// working session for that family — no tampering, no guessing — and can then
// read that child's photographs, drawings and voice notes. It breaks
// SAFEGUARDING rule 4 (scope every child-data path by ownership) and rule 6
// (a parent sees only their own child).
//
// Local development has no mail server, so the on-screen link stays there —
// that convenience is why the original code existed, and it is worth keeping.
export function signInLinkMayBeShown(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}
