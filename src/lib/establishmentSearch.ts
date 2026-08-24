// ---------------------------------------------------------------------------
// Planning one establishment search. Pure: no Prisma, no `server-only`, no I/O.
// ---------------------------------------------------------------------------
//
// The database half is src/app/actions/establishments.ts. Everything that
// decides WHAT to ask is here, so it can be checked in forty milliseconds by
// scripts/check-establishments.ts (wired into `npm run check`) instead of
// only by a browser driving a signup form.
//
// The values it puts into a query go through `likeSafe()` as well as through
// planSearch()'s own allow-list strip. That is not belt and braces for its own
// sake: it is what `scripts/check-like-wildcards.mjs` reads to know the call
// site is safe, and it means the guarantee holds even if someone later hands
// establishmentWhere() a plan they built by hand rather than one planSearch()
// returned. See FINDINGS.md F55.
//
// This module names the column `postcode`, which is on the ops blindness gate's
// denied-identifier list, so it must never be imported by anything under the ops
// roots. That is not a hardship — an operator has no use for this — and it is
// why the register's job vocabulary lives apart in @/lib/establishmentRegister.
// ---------------------------------------------------------------------------

/**
 * Shortest query the server will answer.
 *
 * Three, not two. At two characters a name prefix matches thousands of the
 * twenty thousand rows, and a list that long is not an answer to anything — the
 * teacher has to type more either way, so the only thing a two-character search
 * buys is a wasted round trip per keystroke.
 *
 * The case against three is a London outward code: "E1" is a real, complete
 * outward code and it is two characters. That teacher types "E1 6" and gets a
 * far better list than "every school in a large part of east London", which is
 * what "E1" would have returned. So the cost is one keystroke in one city, and
 * it is worth it.
 */
export const SEARCH_MIN_CHARS = 3;

/**
 * Most rows one search may return, fixed on the server.
 *
 * Twenty, and NOT a parameter. There is no `limit`, no `skip`, no cursor and no
 * page two, deliberately: paging is how a bounded endpoint is turned into an
 * unbounded one twenty rows at a time, and the gate this has to pass asks for a
 * bounded result count and no unbounded wildcard.
 *
 * Twenty is also about the person. Past roughly twenty options a picker stops
 * being read and starts being scrolled, and the right move is to type another
 * letter. The caller is told when there are more rather than being quietly cut
 * off — see `truncated` on the result — because "St Mary's is not in the list"
 * and "St Mary's is not in the list YET" are different sentences.
 *
 * None of this is confidentiality. GIAS publishes the whole file to anybody who
 * wants it, and this endpoint could not leak it if it tried. The bound is here
 * so that an unauthenticated caller cannot make StoryJar scan a table for them
 * indefinitely, and so that nobody later mistakes this for a browse surface.
 */
export const SEARCH_LIMIT = 20;

/**
 * How long the picker waits after the last keystroke before asking, in ms.
 *
 * 250. A comfortable typist runs at about five characters a second, so 250ms is
 * a little over one character's gap: it fires when the teacher pauses, not
 * while they are still typing. Typing "St Bede's Catholic Primary" becomes a
 * handful of requests instead of twenty-six, and the list still appears fast
 * enough to feel like it is keeping up. Below about 150ms it is a request per
 * keystroke; above about 400ms the box feels broken.
 *
 * Exported from here rather than hardcoded in the component so the number the
 * signup picker uses is the number this file documents.
 */
export const SEARCH_DEBOUNCE_MS = 250;

/** Longer than the longest school name in the register; past this it is not a query. */
const MAX_QUERY_CHARS = 60;

/**
 * Characters a school name or a postcode can contain. EVERYTHING ELSE IS
 * DROPPED, and the important word is dropped rather than escaped.
 *
 * This is the load-bearing line in the file. Prisma's `startsWith` and
 * `contains` compile to SQL `LIKE`, and Prisma does not escape LIKE's own
 * wildcards in the value — so a query of "%" reaches the database as `LIKE '%%'`
 * and matches the entire register, and "_" matches any single character. That
 * is the "unbounded wildcard" the gate names, and it arrives through the front
 * door of an unauthenticated endpoint. Restricting the input to letters,
 * digits, spaces, apostrophes, hyphens, ampersands and full stops removes both
 * wildcards, the backslash that would escape them, and every other metacharacter
 * at once, without this file having to know which ones matter.
 */
const ALLOWED = /[^A-Za-z0-9 '&.\-]/g;

/** Looks like the start of a UK postcode: one or two letters then a digit. */
const POSTCODE_SHAPED = /^[A-Z]{1,2}\d/;

import { likeSafe } from "@/lib/likeSafe";

export type SearchPlan =
  | { ok: false; reason: "too-short" }
  | { ok: true; namePrefix: string; postcodePrefixes: string[] };

/**
 * Turn what the teacher typed into the prefixes the query will use.
 *
 * Both halves always run: a teacher who types "LA1" is looking for a postcode
 * and a teacher who types "Grange" is looking for a name, and neither should
 * have to know which box they are in. Searching names for "LA1" costs one more
 * clause and finds nothing, which is the correct answer.
 */
export function planSearch(raw: string): SearchPlan {
  const cleaned = raw
    .slice(0, MAX_QUERY_CHARS)
    .replace(ALLOWED, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < SEARCH_MIN_CHARS) return { ok: false, reason: "too-short" };

  return {
    ok: true,
    namePrefix: cleaned,
    postcodePrefixes: postcodePrefixes(cleaned.toUpperCase()),
  };
}

/**
 * The postcode forms worth trying for one query.
 *
 * THE SPACE IS THE WHOLE PROBLEM. GIAS prints "LA1 5QP" and a teacher types
 * "LA15QP", and a prefix match on the stored string finds nothing. The obvious
 * fix is a second, space-free column to search instead. It is not taken here:
 * six columns and no seventh is a rule in this table for a reason, and a
 * derived column is a second copy of the truth that can drift from the first.
 *
 * So the QUERY is what bends. A UK outward code is two to four characters, so a
 * space-free query has at most three places the space could have gone, and all
 * of them are tried alongside the string as typed. The wrong ones ("LA 15QP",
 * "LA15 QP") match nothing, which costs two clauses on an indexed column.
 *
 * Only generated for a query that is shaped like a postcode at all, so typing
 * "GRANGE" does not send "GR ANGE" and "GRA NGE" to the database on every
 * keystroke.
 */
function postcodePrefixes(upper: string): string[] {
  const forms = [upper];
  if (!upper.includes(" ") && POSTCODE_SHAPED.test(upper)) {
    for (let at = 2; at <= 4; at += 1) {
      if (at < upper.length) forms.push(`${upper.slice(0, at)} ${upper.slice(at)}`);
    }
  }
  return forms;
}

/**
 * Does this name match the query, by the rule the database is asked to apply?
 *
 * WORD prefix, not whole-string prefix, and that decision is worth stating
 * because the plan says "prefix match on name" and the plainest reading of it
 * is wrong for English primary schools. A large share of them begin with "St",
 * and plenty more with "The": a teacher at St Bede's Catholic Primary School
 * types "Bede", and a whole-string prefix match tells them their school is not
 * in the register. That is the failure this whole feature exists to prevent.
 *
 * Matching any WORD's start fixes it, and it also disposes of the leading-"The"
 * question on its own — "Grange" finds "The Grange Primary School" without a
 * special case for the word "The", which would have been a special case for
 * exactly one word out of several.
 *
 * It is NOT a substring match. "ede" does not find "St Bede's". That matters:
 * `contains` with no leading space is the unbounded wildcard shape, where a
 * single common letter returns most of the register.
 *
 * What it still does not do, said plainly rather than discovered later: it does
 * not fold punctuation. "Bedes" does not find "St Bede's", and "St." does not
 * find "St ". If that turns out to be what teachers actually type, the fix is a
 * fold applied to both sides — not a substring match.
 *
 * Exported so the checked rule and the rendered rule are the same rule: the
 * picker uses it to highlight, and scripts/check-establishments.ts uses it
 * to assert the SQL clauses in the action mean what this comment says.
 */
export function nameMatches(name: string, namePrefix: string): boolean {
  const n = name.toLowerCase();
  const q = namePrefix.toLowerCase();
  return n.startsWith(q) || n.includes(` ${q}`);
}

/**
 * The `where` the register is actually queried with.
 *
 * Built here, in the pure module, rather than inline in the server action, for
 * one reason: it means the spec that asserts the query is bounded and
 * wildcard-proof is asserting THE query, not a copy of it that can drift. The
 * action does nothing to it but pass it to Prisma.
 *
 * The shape is written out rather than imported from Prisma so this module stays
 * free of the client. It satisfies `EstablishmentWhereInput` structurally, and if
 * that ever stops being true the typecheck in the action says so.
 */
export type EstablishmentWhere = {
  OR: (
    | { name: { startsWith: string } }
    | { name: { contains: string } }
    | { postcode: { startsWith: string } }
  )[];
};

export function establishmentWhere(plan: Extract<SearchPlan, { ok: true }>): EstablishmentWhere {
  return {
    OR: [
      // The name matches at the start of any WORD. The second clause is a
      // `contains` with a LEADING SPACE, which is what makes "Bede" find
      // "St Bede's Catholic Primary School" without letting "ede" find it —
      // and it is why the leading space is not an accident to be tidied away.
      { name: { startsWith: likeSafe(plan.namePrefix) } },
      { name: { contains: ` ${likeSafe(plan.namePrefix)}` } },
      // Every plausible place the space could have gone in a postcode.
      ...plan.postcodePrefixes.map((p) => ({ postcode: { startsWith: likeSafe(p) } })),
    ],
  };
}

/** One row as the picker shows it. Five public fields; there is no sixth to leak. */
export type EstablishmentResult = {
  urn: string;
  name: string;
  town: string;
  postcode: string;
  localAuthority: string;
};

/**
 * The single string a screen reader announces for one option.
 *
 * One string, not four fragments: the picker shows the name on one line and the
 * place beneath it, and a screen reader user has to hear one coherent option
 * label rather than a name followed by three loose pieces of an address.
 *
 * Town can be empty in GIAS for a handful of establishments, so it is joined
 * rather than concatenated and never leaves a stray comma.
 */
export function establishmentLabel(e: EstablishmentResult): string {
  return [e.name, e.town, e.postcode].filter(Boolean).join(", ");
}
