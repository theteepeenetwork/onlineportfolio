import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_A, SCHOOL_B, SCHOOL_C, loginTeacher, asOperator } from "../helpers";
import { MONITORED, NOT_MONITORED, NOT_RECORDED, instanceFacts } from "@/lib/ops/health";

// ===========================================================================
// A31 - The service health pane (PR6), read-only and honest about its gaps
//
// This screen is mostly status, and status is the easiest thing in a product
// to fake. A tile that renders calm because its feed is missing is worse than
// no tile at all: it is a green light with no gate behind it, and the person
// reading it at seven in the morning will believe it. So the two things this
// suite exists to prove are that the pane says "not monitored" wherever there
// is no signal, and that it cannot do anything.
//
// The three rulings it is built to, quoted rather than cited:
//
//   R19. "Health endpoint body is exactly {"ok":true}, or 503 with a fixed
//   word from a closed set", and "PR6 renders the internal result rather than
//   fetching the public endpoint". Both halves are asserted here: the public
//   contract is unchanged by this PR, and loading the pane makes no request to
//   it. The second is asserted at the network layer rather than by reading the
//   source, because "no fetch under the ops roots" is already a build failure
//   in scripts/check-ops-blindness.mjs and an assertion that only repeats a
//   gate proves nothing about the running page.
//
//   R13. "No live pipeline run from a web button." This pane may show state.
//   It may not trigger anything. There is no button, no form and no field on
//   it at all, which is a stronger and much easier property to keep than "no
//   dangerous button".
//
//   R17. Unauthorised access to any ops route is the standard not-found
//   response. Asserted as a pair on the same URL with two sessions, because
//   this area answers 404 to everything it dislikes and a route that has
//   stopped existing looks exactly like a working guard.
//
// HOW THIS SPEC SIGNS IN: as a person does, with the password and a real TOTP
// code computed from the seeded secret. There is no bypass (ruling R6).
// ===========================================================================

const ROUTE = "/ops/health";

// Everything prisma/seed-test.ts puts in the database that must never reach an
// operator screen: children's first names, class names, and the credential
// values that would let a reader sign in as a family or a child.
const CHILD_NAMES = [
  "Amara", "Ben", "Chloe", "Dev", "Ella", "Finn", "Grace", "Harry", "Isla",
  "Ava", "Theo", "Mia", "Zara", "Yusuf", "Willow", "Pip", "Robin", "Sage",
];
const CLASS_NAMES = ["Sunflower", "Ladybird", "Acorns", "Butterflies", "Acorn Class", "Willow Class"];
const CODES = [
  SCHOOL_A.classCode,
  SCHOOL_B.classCode,
  SCHOOL_C.classCode,
  SCHOOL_A.parentFamilyCode,
  SCHOOL_B.parentFamilyCode,
];

// The tiles, and what each one is entitled to say. This list is the spec's own
// copy of the design: a tile added to the page without a decision about which
// half of this table it belongs in fails here.
const LIVE_TILES = ["database", "instance"];
const DARK_TILES = ["media-volume", "startup-check", "outside-watch", "backups", "scheduled-jobs"];

async function payload(page: Page): Promise<string> {
  // page.content() rather than textContent: props can be serialised into the
  // flight payload without ever being rendered, and a leak nobody can see on
  // screen is still a leak.
  return page.content();
}

function tile(page: Page, id: string) {
  return page.locator(`[data-tile="${id}"]`);
}

// ---------------------------------------------------------------------------
// 1. The door
// ---------------------------------------------------------------------------

test(`${ROUTE} is 404 to a stranger and 200 to the operator, on the same URL`, async ({ page }) => {
  await page.context().clearCookies();
  const anonymous = await page.goto(ROUTE);
  expect(anonymous?.status(), "an unauthenticated operator route must answer 404").toBe(404);
  // Not a redirect to a sign-in page either: that would name the area.
  expect(new URL(page.url()).pathname).toBe(ROUTE);
  expect((await payload(page)).toLowerCase()).not.toContain("storyjar operations");

  // Positive control: same URL, same fixture, the other session.
  await asOperator(page);
  const authorised = await page.goto(ROUTE);
  expect(authorised?.status()).toBe(200);
  await expect(page.getByRole("navigation", { name: /operations/i })).toBeVisible();
});

test(`a teacher session gets 404 from ${ROUTE}, and their own console still works`, async ({
  page,
}) => {
  await loginTeacher(page, SCHOOL_A.admin);
  const refused = await page.goto(ROUTE);
  expect(refused?.status(), "a teacher session must not reach the operator area").toBe(404);

  // Positive control on the role axis: the same browser, the same cookie, the
  // door that session is entitled to.
  const allowed = await page.goto("/admin");
  expect(allowed?.status()).toBe(200);
});

test(`${ROUTE} is never indexed and never cached`, async ({ page }) => {
  await asOperator(page);
  const res = await page.goto(ROUTE);
  expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
  expect(res?.headers()["cache-control"] ?? "").toMatch(/no-store|no-cache/);
});

// ---------------------------------------------------------------------------
// 2. A tile with no feed says so
// ---------------------------------------------------------------------------

test("every tile carries a status in words, and the two vocabularies are the only ones", async ({
  page,
}) => {
  await asOperator(page);
  await page.goto(ROUTE);

  const tiles = page.locator("[data-tile]");
  await expect(tiles, "the pane rendered no tiles at all").toHaveCount(
    LIVE_TILES.length + DARK_TILES.length,
  );

  const ids = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("data-tile") ?? ""));
  expect(ids.sort()).toEqual([...LIVE_TILES, ...DARK_TILES].sort());

  for (const id of ids) {
    const status = tile(page, id).locator("[data-tile-status]");
    await expect(status, `tile "${id}" has no status element`).toHaveCount(1);
    const text = ((await status.textContent()) ?? "").trim();
    expect([MONITORED, NOT_MONITORED], `tile "${id}" invented a status: "${text}"`).toContain(text);
  }
});

test("a tile with no feed renders \"not monitored\", never something calm", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);

  for (const id of DARK_TILES) {
    const status = tile(page, id).locator("[data-tile-status]");
    await expect(status, `tile "${id}" must say it is not monitored`).toHaveText(NOT_MONITORED);
    // And it says WHY, in the tile, rather than leaving the reader to guess
    // whether the silence is good news.
    const why = ((await tile(page, id).textContent()) ?? "").trim();
    expect(why.length, `tile "${id}" says nothing about why it has no feed`).toBeGreaterThan(80);
  }

  // Positive control on the same page: the tiles that DO have a signal say so,
  // so "not monitored" is a judgement this page is capable of not making.
  for (const id of LIVE_TILES) {
    await expect(tile(page, id).locator("[data-tile-status]")).toHaveText(MONITORED);
  }
});

test("the pane names the decisions and the absences behind the dark tiles", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);

  // Each of these is a fact about this service on 17 August 2026, and each is
  // the reason a tile is dark. If one of them becomes untrue, the tile is
  // wrong and this test is how that gets noticed.
  await expect(tile(page, "outside-watch")).toContainText("D13");
  await expect(tile(page, "backups")).toContainText("D2");
  await expect(tile(page, "backups")).toContainText("RETENTION.md");
  await expect(tile(page, "scheduled-jobs")).toContainText("billing:freeze");
});

// ---------------------------------------------------------------------------
// 3. It shows state, and it cannot do anything (ruling R13)
// ---------------------------------------------------------------------------

test("there is no control of any kind on the health pane", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);
  // Positive control: the page rendered before anything is counted as absent.
  await expect(page.locator("main")).toContainText("Service health");

  await expect(
    page.locator("main button, main input, main select, main textarea, main form"),
    "R13: the health pane may show state and may not trigger anything",
  ).toHaveCount(0);
  // Not even a disabled one. A greyed-out control teaches the next person that
  // the feature is wanted (ruling R16's reasoning, applied to a button nobody
  // should add).
  await expect(page.locator("main [disabled], main [aria-disabled='true']")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Nothing on this screen can be run from here.");
});

test("loading the pane makes no request to the public healthcheck (R19)", async ({ page }) => {
  await asOperator(page);

  const asked: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/health") asked.push(req.url());
  });

  await page.goto(ROUTE);
  await expect(page.locator("main")).toContainText("Service health");
  // Give a stray client-side poll a moment to happen before concluding it did
  // not: an assertion that races the thing it forbids is not an assertion.
  await page.waitForTimeout(1000);

  expect(
    asked,
    "the pane must render the internal result, not fetch the public endpoint",
  ).toEqual([]);
});

test("PR6 leaves the public healthcheck contract exactly as OPS-0a built it", async ({
  request,
}) => {
  // The positive control for the test above: /api/health is still there, still
  // public, and still returns the literal bytes ruling R19 fixes. A pane that
  // renders the internal result is only interesting while the endpoint it is
  // deliberately not calling still works.
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe('{"ok":true}');
});

// ---------------------------------------------------------------------------
// 4. Nothing about a child, and nothing about the operator's own credentials
// ---------------------------------------------------------------------------

test("no child name, class name or credential value reaches the health pane", async ({ page }) => {
  await asOperator(page);
  await page.goto(ROUTE);
  const body = await payload(page);

  // Positive control first: every negative below is worthless against a page
  // that did not render.
  expect(body).toContain("Service health");
  expect(body).toContain(NOT_MONITORED);

  for (const name of CHILD_NAMES) {
    expect(body, `a child's name reached the health pane: ${name}`).not.toContain(name);
  }
  for (const name of CLASS_NAMES) {
    expect(body, `a class name reached the health pane: ${name}`).not.toContain(name);
  }
  for (const code of CODES) {
    expect(body, `a credential value reached the health pane: ${code}`).not.toContain(code);
  }
  // The pane reports on a volume that holds children's media. It must not
  // report a path into it, or a file in it.
  expect(body).not.toContain("/uploads/");
  expect(body, "a media file name reached the health pane").not.toMatch(/seed-\w+\.(svg|m4a|webm)/);
});

// ---------------------------------------------------------------------------
// 5. The instance facts, in both directions
// ---------------------------------------------------------------------------

test("an absent deployment fact reads as not recorded rather than as an empty gap", () => {
  // The battery runs on a developer's machine and in GitHub Actions, so none of
  // Railway's variables are set here and the "not recorded" branch is the one
  // the rendered page exercises. The other branch is the one that only ever
  // runs in production, which is exactly why it is asserted here rather than
  // left to be seen for the first time on a live deploy.
  const started = new Date("2026-08-17T06:30:00Z");

  const bare = instanceFacts({}, started);
  expect(bare.map((f) => f.term)).toContain("Deployed commit");
  for (const fact of bare) {
    expect(fact.value.length, `"${fact.term}" rendered as an empty gap`).toBeGreaterThan(0);
  }
  expect(bare.filter((f) => f.value === NOT_RECORDED).length).toBeGreaterThan(0);

  const deployed = instanceFacts(
    {
      RAILWAY_GIT_COMMIT_SHA: "d0beb8f5c55b36df7d674d55965a23b8d54ad69b",
      RAILWAY_GIT_BRANCH: "main",
      RAILWAY_ENVIRONMENT_NAME: "production",
      RAILWAY_REPLICA_REGION: "europe-west4-drams3a",
    },
    started,
  );
  const values = deployed.map((f) => f.value).join(" | ");
  expect(values, "the short commit is what an operator compares against GitHub").toContain("d0beb8f");
  expect(values).toContain("main");
  expect(values).toContain("production");
  expect(values).toContain("europe-west4-drams3a");
  expect(values, "nothing is left saying not recorded once Railway has told us").not.toContain(
    NOT_RECORDED,
  );

  // The commit message is deliberately not a fact this pane renders: it is free
  // text written by whoever made the commit, and an operator screen is not the
  // place to find out what it says.
  const noisy = instanceFacts(
    { RAILWAY_GIT_COMMIT_MESSAGE: "fix Amara's jar" },
    started,
  );
  expect(noisy.map((f) => f.value).join(" ")).not.toContain("Amara");
});
