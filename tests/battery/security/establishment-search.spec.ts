import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  SEARCH_LIMIT,
  SEARCH_MIN_CHARS,
  establishmentWhere,
  planSearch,
} from "@/lib/establishmentSearch";

// ===========================================================================
// The establishment search cannot be turned into a data-extraction endpoint.
//
// WHAT IS AND IS NOT AT STAKE, because getting this backwards leads to the
// wrong tests. The register is the DfE's open data: every column it can return
// is published in a CSV that anyone can download, under the Open Government
// Licence, and there is no tenant, no person and no child anywhere in the
// table. So this is NOT a confidentiality gate and there is no cross-tenant
// isolation test to write — School B reaching School A's establishments is not
// a thing, because establishments do not belong to a school.
//
// What IS at stake is shape. This is the only unauthenticated endpoint in
// StoryJar that queries a twenty-thousand-row table, it is reachable before any
// account exists, and the plan's gate asks for a bounded result count and no
// unbounded wildcard. Those two properties are asserted here against the real
// register and the real query.
//
// HOW THE QUERY IS REACHED, AND HOW FAR THAT GOES. The `where` clause is built by
// establishmentWhere() in @/lib/establishmentSearch and handed to Prisma
// unchanged by src/app/actions/establishments.ts, so **the matching rule
// asserted here is the one that runs** — that is the half worth having, and it
// is why the builder was moved out of the action.
//
// The rest of the query is NOT. `select`, `orderBy` and `take` are re-declared
// by the local helper below, so the projection test further down asserts a
// duplicate of the action's projection rather than the action's. It is still
// worth running — it catches a seventh column added to the model and published
// by reflex — but it would not catch somebody widening the `select` in the
// action alone. Read it as "the projection we intend", not "the projection that
// ships".
//
// Two things this file cannot reach at all, named so their absence is a decision
// rather than an oversight, and both answered the same way: they need a real
// request, and nothing drives one until the signup picker exists at step 3. The
// per-IP throttle needs headers. The action itself needs a page. When the picker
// lands, the right move is to drive the real action through it and let this file
// keep the pure matching rules.
//
// Fixtures: prisma/seed-test.ts seeds 33 INVENTED schools, including 25 sharing
// one name prefix so the bound can be shown to bite. No real school's name or
// postcode is in the test database, ever (docs/TEST_LOGINS.md).
// ===========================================================================

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

/** Exactly what the server action does, minus the throttle it cannot reach. */
async function search(query: string) {
  const plan = planSearch(query);
  if (!plan.ok) return { refused: true as const, items: [], truncated: false };
  const rows = await db.establishment.findMany({
    where: establishmentWhere(plan),
    select: { urn: true, name: true, town: true, postcode: true, localAuthority: true },
    orderBy: [{ name: "asc" }, { urn: "asc" }],
    take: SEARCH_LIMIT + 1,
  });
  return {
    refused: false as const,
    items: rows.slice(0, SEARCH_LIMIT),
    truncated: rows.length > SEARCH_LIMIT,
  };
}

test("the register is seeded, and holds nothing real", async () => {
  const total = await db.establishment.count();
  expect(total).toBeGreaterThan(0);
  // A guard rather than a formality: if somebody ever points the test seed at
  // the real GIAS extract, this is where it is caught, before a real school's
  // postcode appears in a failure screenshot.
  expect(total).toBeLessThan(200);
});

test("no query can return more than the bound", async () => {
  // 25 seeded schools share this prefix, so an unbounded query would return 25.
  const result = await search("Meadowbank");
  expect(result.items.length).toBe(SEARCH_LIMIT);
  expect(result.truncated).toBe(true);
});

test("a truncated answer says so rather than pretending to be complete", async () => {
  const many = await search("Meadowbank");
  expect(many.truncated).toBe(true);
  const few = await search("Bramblewick");
  expect(few.truncated).toBe(false);
  expect(few.items.length).toBeGreaterThan(0);
});

test("a LIKE wildcard does not return the register", async () => {
  // Prisma compiles startsWith/contains to LIKE and does NOT escape the value,
  // so an unstripped "%" would match every row. Verified against SQLite on
  // 24 August 2026: `contains: "%"` returns the whole table.
  for (const hostile of ["%", "%%%", "___", "%_%", "%a%"]) {
    const result = await search(hostile);
    const total = await db.establishment.count();
    // Either refused for being too short, or answered without having matched
    // everything. What must never happen is the whole register coming back.
    expect(result.items.length).toBeLessThan(total);
    expect(result.items.length).toBeLessThanOrEqual(SEARCH_LIMIT);
  }
});

test("a wildcard cannot be smuggled in behind enough real characters", async () => {
  // Long enough to pass the minimum, so "it was too short" is not what saves us.
  const result = await search("Meadowbank%");
  expect(result.refused).toBe(false);
  // It matches Meadowbank rows on the letters, and the "%" matched nothing extra.
  for (const item of result.items) {
    expect(item.name.toLowerCase()).toContain("meadowbank");
  }
});

test("a query below the minimum is refused before it reaches the database", async () => {
  expect(planSearch("a").ok).toBe(false);
  expect(planSearch("ab").ok).toBe(false);
  expect(planSearch("abc").ok).toBe(true);
  expect(SEARCH_MIN_CHARS).toBe(3);
});

test("a mid-word fragment does not match, so one common letter cannot sweep the table", async () => {
  // "ead" is inside Meadowbank. A substring match would return all 25.
  const result = await search("eadowbank");
  expect(result.items.length).toBe(0);
});

test("a teacher finds their school by its distinctive word, not only its first", async () => {
  // The reason word-prefix matching exists: most English primaries begin with
  // "St" or "The" or a place name, and a whole-string prefix match tells the
  // teacher their school is not in the register.
  const grange = await search("Grange");
  expect(grange.items.map((e) => e.name)).toContain("The Grange Infant School");

  const cuthbert = await search("Cuthbert");
  expect(cuthbert.items.length).toBe(2);
});

test("two schools with the same name are told apart by postcode", async () => {
  const result = await search("St Cuthbert");
  expect(result.items.length).toBe(2);
  const postcodes = result.items.map((e) => e.postcode).sort();
  expect(postcodes).toEqual(["AB1 3EF", "CD12 9ZZ"]);
  // Same name, different URN: the join key is what the picker stores.
  expect(new Set(result.items.map((e) => e.urn)).size).toBe(2);
});

test("a postcode typed without its space still finds the school", async () => {
  const spaced = await search("AB1 3EF");
  const squashed = await search("AB13EF");
  expect(spaced.items.map((e) => e.urn)).toContain("900002");
  expect(squashed.items.map((e) => e.urn)).toContain("900002");
});

test("the projection we intend carries five public columns and nothing else", async () => {
  const result = await search("Bramblewick");
  expect(result.items.length).toBeGreaterThan(0);
  // A Prisma read with no select: returns every scalar column. This asserts the
  // projection is doing its job, so a seventh column added to the table later
  // does not publish itself through this endpoint.
  expect(Object.keys(result.items[0]).sort()).toEqual([
    "localAuthority",
    "name",
    "postcode",
    "town",
    "urn",
  ]);
});

test("the answer is stable, so a truncated list does not reshuffle while it is read", async () => {
  const first = await search("Meadowbank");
  const second = await search("Meadowbank");
  expect(first.items.map((e) => e.urn)).toEqual(second.items.map((e) => e.urn));
});
