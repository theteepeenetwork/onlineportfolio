"use server";

import { db } from "@/lib/db";
import { allowEstablishmentSearch, clientIp } from "@/lib/rateLimit";
import {
  SEARCH_LIMIT,
  establishmentWhere,
  planSearch,
  type EstablishmentResult,
} from "@/lib/establishmentSearch";

// ---------------------------------------------------------------------------
// Establishment search: the server half of the school picker on signup.
// ---------------------------------------------------------------------------
//
// UNAUTHENTICATED, AND THAT IS THE POINT. It runs at step 2 of the signup
// wizard, before any account exists, so there is nobody to be. That makes it the
// most exposed endpoint this feature adds, and everything below is shaped by it.
//
// It is also the least sensitive query in the codebase. Every column it can
// return — URN, name, town, postcode, local authority — is published by the DfE
// in a CSV anyone can download, under the Open Government Licence. There is no
// tenant to isolate, no person to identify and nothing to leak: two teachers at
// different schools asking the same question get the same answer, correctly.
// So the bounds here are NOT about confidentiality. They are about not building
// a browse surface by accident, and not letting one caller make StoryJar scan a
// table for them all afternoon.
//
// WHY SERVER-SIDE AT ALL, rather than shipping the register to the browser.
// Twenty thousand rows is roughly a megabyte before it is anything useful, on a
// signup page, over a school's connection. The search is a query.
//
// WHAT IS DELIBERATELY ABSENT:
//
//   - No `limit`, `skip`, `cursor` or page two. Paging is how a bounded
//     endpoint becomes an unbounded one twenty rows at a time. The caller is
//     told there are more results and asked to type another letter.
//   - No substring match. See nameMatches() for what the rule is and why the
//     obvious `contains` is refused.
//   - No sort parameter. The order is fixed, so two callers cannot use it to
//     walk the table from both ends.
//   - No "did you mean", no fuzzy match, no Levenshtein. A guess about which
//     school somebody means is exactly what this register exists to remove
//     (docs/school-identity.md), and it must not creep back in as a nicety.
// ---------------------------------------------------------------------------

export type EstablishmentSearchResult = {
  items: EstablishmentResult[];
  /** True when the register holds more matches than were returned. */
  truncated: boolean;
  /** Set when the query was refused rather than answered. */
  refused?: "too-short" | "busy";
};

const NOTHING: EstablishmentSearchResult = { items: [], truncated: false };

export async function searchEstablishments(
  query: string,
): Promise<EstablishmentSearchResult> {
  const plan = planSearch(query);
  if (!plan.ok) return { ...NOTHING, refused: "too-short" };

  if (!allowEstablishmentSearch(await clientIp())) {
    return { ...NOTHING, refused: "busy" };
  }

  // One more than the bound, so "there are more" is a fact rather than a guess
  // from a full page.
  const rows = await db.establishment.findMany({
    // Built by @/lib/establishmentSearch, so the clause the spec asserts and
    // the clause that runs are the same clause.
    where: establishmentWhere(plan),
    // Named one at a time rather than taking the row: a Prisma read with no
    // `select:` returns every scalar column, and the next person to add a
    // column to this table should have to come here to publish it.
    select: {
      urn: true,
      name: true,
      town: true,
      postcode: true,
      localAuthority: true,
    },
    // Fixed, and therefore deterministic: the same query returns the same
    // twenty rows every time, so a truncated list is stable while the teacher
    // reads it.
    orderBy: [{ name: "asc" }, { urn: "asc" }],
    take: SEARCH_LIMIT + 1,
  });

  return {
    items: rows.slice(0, SEARCH_LIMIT),
    truncated: rows.length > SEARCH_LIMIT,
  };
}
