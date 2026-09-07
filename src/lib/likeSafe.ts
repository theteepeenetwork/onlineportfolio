// ---------------------------------------------------------------------------
// likeSafe: make a value safe to hand to Prisma's `contains` / `startsWith` /
// `endsWith`. Pure — no Prisma, no `server-only`, no I/O.
// ---------------------------------------------------------------------------
//
// THE PROBLEM THIS EXISTS FOR (FINDINGS.md F55)
//
// Those three operators compile to SQL `LIKE`, and **Prisma does not escape
// LIKE's own wildcards in the value.** A query of `%` reaches the database as
// `LIKE '%%'` and matches every row of the table; `_` matches any single
// character. Verified against SQLite on 2026-08-24: `contains: "%"` returned all
// 35 seeded Student rows.
//
// WHY IT STRIPS RATHER THAN ESCAPES
//
// Escaping is the textbook answer and it is not available here. SQL's `LIKE`
// escapes with a trailing `ESCAPE '\'` clause, and Prisma's `contains` offers no
// way to emit one — so `\%` would be searched for literally, which is a
// different bug wearing a fix's clothes. Dropping the two characters entirely is
// the option that exists, and for a search box it is also the better one: a
// teacher typing `%` into a school name means nothing by it.
//
// WHAT THIS IS NOT
//
// It is **not** a substitute for scoping a query by ownership. Every other
// LIKE in this codebase is safe because its `where` is already scoped to the
// caller's own rows (SAFEGUARDING rule 4), and that is the control that matters.
// This function is for the case scoping cannot cover: a search reachable by
// somebody with no account, over a table that belongs to nobody. Use both where
// both apply.
//
// Enforced at the call site by `scripts/check-like-wildcards.mjs`, which is why
// this is a named function rather than a regex somebody remembers to run.
// ---------------------------------------------------------------------------

/** LIKE's own metacharacters, plus the backslash that would be used to escape them. */
const LIKE_METACHARACTERS = /[%_\\]/g;

/**
 * Strip the characters that would turn a search term into a wildcard.
 *
 * Deliberately narrow: it removes `%`, `_` and `\` and touches nothing else. It
 * is not a general input sanitiser and must not grow into one — a caller that
 * needs a stricter vocabulary should restrict its own input (as
 * `planSearch()` does) and pass the result through here as well.
 */
export function likeSafe(value: string): string {
  return value.replace(LIKE_METACHARACTERS, "");
}
