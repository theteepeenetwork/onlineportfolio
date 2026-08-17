// The operator session cookie contract (handbook ruling R7).
//
// R7 in full: `__Host-sj_ops`, `Path=/`, `httpOnly`, `SameSite=Strict`,
// `Secure` in production, with an unprefixed fallback in local development and
// a comment saying why. Path scoping is NOT a boundary; the server check is.
//
// Why the two names, and why the prefix and a scoped path cannot both happen:
//
//   The `__Host-` prefix is enforced by the browser, and it means exactly three
//   things: the cookie was set with Secure, it has no Domain attribute, and its
//   Path is "/". A browser silently REFUSES to store a `__Host-` cookie that
//   breaks any of those. So `__Host-` and `Path=/ops` are mutually exclusive,
//   and the choice is between a browser-enforced guarantee and a path that
//   guarantees nothing. Path is not a security boundary: it is not sent to the
//   server as a claim, it stops no request, and every ops route checks the
//   session on the server regardless. R7 takes the browser-enforced one.
//
//   Secure cannot be set over plain http, so a `__Host-` cookie cannot be
//   stored at all on http://localhost. Development therefore uses the
//   unprefixed name. That is a real difference between environments, so it is
//   stated in one place, in code, rather than discovered: the name IS the
//   evidence of whether the prefix's guarantees are in force.
//
// This module is deliberately free of `import "server-only"` so a blocking spec
// can import the contract and assert it in BOTH directions: a `__Host-` name
// implies Secure and Path "/" and no Domain, and a cookie without Secure never
// carries the prefix. See tests/battery/security/ops-auth.spec.ts (A21).
//
// The name is also distinct from `portfolio_session`, and that distinctness is
// what actually keeps the two identity systems apart: one cookie carries
// teacher, student AND parent sessions, and the operator is none of those.

export const OPS_COOKIE_BASE = "sj_ops";
export const HOST_PREFIX = "__Host-";

export type OpsCookieContract = {
  name: string;
  path: "/";
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  // Never set. A Domain attribute would widen the cookie to every subdomain and
  // is forbidden by the `__Host-` prefix in any case.
  domain: undefined;
};

export function opsCookieName(secure: boolean): string {
  return secure ? `${HOST_PREFIX}${OPS_COOKIE_BASE}` : OPS_COOKIE_BASE;
}

export function opsCookieContract(secure: boolean): OpsCookieContract {
  return {
    name: opsCookieName(secure),
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure,
    domain: undefined,
  };
}

// The invariant both directions of the spec assert, written once so the
// implementation and the test cannot drift apart: prefixed if and only if
// secure, always Path "/", always httpOnly, always SameSite=Strict, never a
// Domain. Returns the reason it fails rather than a bare boolean so a failing
// assertion says what went wrong.
export function cookieContractProblem(c: OpsCookieContract): string | null {
  const prefixed = c.name.startsWith(HOST_PREFIX);
  if (prefixed !== c.secure) {
    return prefixed
      ? `"${c.name}" carries the __Host- prefix without Secure; the browser would refuse to store it.`
      : `Secure is set but the name "${c.name}" does not carry the __Host- prefix, so the browser enforces nothing.`;
  }
  if (c.path !== "/") return `path is "${c.path}"; __Host- requires "/" and a scoped path is not a boundary anyway.`;
  if (c.httpOnly !== true) return "httpOnly is not set.";
  if (c.sameSite !== "strict") return `SameSite is "${c.sameSite}", not "strict".`;
  if (c.domain !== undefined) return `a Domain attribute is set ("${c.domain}"), which widens the cookie and breaks the prefix.`;
  return null;
}
