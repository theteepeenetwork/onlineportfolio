import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ===========================================================================
// A15: the ops blindness gate fires.
//
// PR0's gate (scripts/check-ops-blindness.mjs) is the whole design of the
// operator programme: the promise made to a school's data protection lead is
// not "we will be careful", it is that a build fails if operator code can reach
// a child's work or a credential that opens one. Handbook ruling R3 splits the
// work deliberately: "Security implements and owns it; QA owns the fixture
// corpus, --self-test, and the red-build drill... The author of a gate is the
// worst person to certify it fires."
//
// The per-rule corpus lives in tests/fixtures/ops-blindness/ and is checked by
// `node scripts/check-ops-blindness.mjs --self-test`. That harness feeds one
// file at a time to the rule engine, which is the right shape for a rule and
// the wrong shape for three things the gate's own header names as unprovable
// from a single file:
//
//   1. the transitive local import walk, which needs several real files that
//      really import one another;
//   2. the zero-scanned-files anti-rot assertion, which needs a directory that
//      really exists and really holds no code;
//   3. the schema drift checks in both directions, which need a modified
//      prisma/schema.prisma.
//
// This spec covers all three, plus the honesty of --self-test itself. It is
// here rather than inside the gate script for three reasons. It needs real
// files on disk and a real subprocess, which is test-harness work rather than
// gate work. It keeps the gate script owned by Security and edited only for
// rules, per R3. And it can assert exit codes and verbatim stderr, which is
// what the red-build drill actually needs to record.
//
// HOW IT STAYS SAFE. Every case builds a throwaway tree under the OS temp
// directory and runs the real gate with cwd pointed at it, so a mutated schema
// or a deliberately violating source file never touches the repository. The
// only cases that run against the repository itself are read-only.
// ===========================================================================

const REPO = process.cwd();
const GATE = path.join(REPO, "scripts", "check-ops-blindness.mjs");
const REAL_SCHEMA = readFileSync(path.join(REPO, "prisma", "schema.prisma"), "utf8");
const CORPUS = path.join(REPO, "tests", "fixtures", "ops-blindness");

type Run = { status: number; stdout: string; stderr: string; output: string };

function runGate(cwd: string, args: string[] = [], script = GATE): Run {
  try {
    const stdout = execFileSync("node", [script, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "", output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    const stdout = e.stdout ?? "";
    const stderr = e.stderr ?? "";
    return { status: e.status ?? -1, stdout, stderr, output: `${stdout}\n${stderr}` };
  }
}

const trees: string[] = [];

function makeTree(files: Record<string, string>, schema = REAL_SCHEMA): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ops-blindness-"));
  trees.push(dir);
  const write = (rel: string, content: string) => {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  };
  write("prisma/schema.prisma", schema);
  for (const [rel, content] of Object.entries(files)) write(rel, content);
  return dir;
}

// A corpus is only valid to the self-test if it holds at least one violating
// and one clean fixture, so the helpers that need a valid one start from these.
// Judged as an action rather than as src/lib/ops/reads.ts, because reads.ts is
// one of the two declared modules that may hold the Prisma client and would not
// fire this rule at all.
const MINIMAL_BAD = [
  "// @path: src/app/actions/ops/schools.ts",
  "// @expect: OPS-PRISMA-IMPORT",
  '"use server";',
  'import { db } from "@/lib/db";',
  'import { requireOperator } from "@/lib/ops/session";',
  "export async function schoolCount() {",
  "  await requireOperator();",
  "  return db.school.count();",
  "}",
].join("\n");

const MINIMAL_GOOD = [
  "// @path: src/lib/ops/reads.ts",
  'import "server-only";',
  'export const NOTE = "adult and billing reads live here";',
].join("\n");

test.afterAll(() => {
  for (const dir of trees) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Positive control. Everything below asserts a failure, so the suite is
// worthless unless the gate can also go green. A gate that cannot go green is a
// gate somebody deletes.
// ---------------------------------------------------------------------------
test.describe("A15.0 the gate passes on the repository as it stands", () => {
  test("the gate exits 0 on main", () => {
    const run = runGate(REPO);
    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("Ops blindness gate passed");
  });

  test("the self-test exits 0 on the committed corpus", () => {
    const run = runGate(REPO, ["--self-test"]);
    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("self-test passed");
  });

  test("a clean ops tree passes, so the rules can be satisfied", () => {
    const dir = makeTree({
      "src/lib/ops/reads.ts": [
        'import "server-only";',
        'import { db } from "@/lib/db";',
        "export async function listSchoolsForOps() {",
        "  return db.school.findMany({ select: { id: true, name: true, createdAt: true } });",
        "}",
      ].join("\n"),
      "src/lib/ops/session.ts": [
        'import "server-only";',
        "export async function requireOperator() {",
        "  return { id: 'op_1' };",
        "}",
      ].join("\n"),
      "src/app/actions/ops/schools.ts": [
        '"use server";',
        'import { requireOperator } from "@/lib/ops/session";',
        'import { listSchoolsForOps } from "@/lib/ops/reads";',
        "export async function schoolsForOps() {",
        "  await requireOperator();",
        "  return listSchoolsForOps();",
        "}",
      ].join("\n"),
      "src/lib/db.ts": 'export const db = {} as never;',
    });
    const run = runGate(dir);
    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("file(s) scanned including transitive local imports");
  });
});

// ---------------------------------------------------------------------------
// 1. The transitive local import walk.
//
// "src/lib/ops/reads.ts is the only file that touches Prisma" is worthless if
// an ops screen imports a shared helper that itself imports the database. The
// corpus can show that the far end of a chain is judged when it is handed to
// the rule engine directly; only a real tree can show that the walk gets there.
// ---------------------------------------------------------------------------
test.describe("A15.1 the transitive local import walk", () => {
  const chain = (opsImport: string) => ({
    // Not under an ops root. It is pulled in by reverse membership because it
    // imports an ops module, which is the shape the gate exists to catch: an
    // ops action parked in a billing file to dodge the scan roots.
    "src/app/actions/billing.ts": [
      '"use server";',
      `import { requireOperator } from "${opsImport}";`,
      'import { schoolPanel } from "@/lib/hopOne";',
      "export async function panel() {",
      "  await requireOperator();",
      "  return schoolPanel();",
      "}",
    ].join("\n"),
    "src/lib/ops/session.ts": "export async function requireOperator() { return null; }",
    "src/lib/hopOne.ts": 'import { hopTwo } from "@/lib/hopTwo";\nexport const schoolPanel = () => hopTwo();',
    "src/lib/hopTwo.ts": 'import { hopThree } from "@/lib/hopThree";\nexport const hopTwo = () => hopThree();',
    "src/lib/hopThree.ts": [
      'import { db } from "@/lib/db";',
      "export const hopThree = () => db.journalItem.findMany({ take: 20 });",
    ].join("\n"),
    "src/lib/db.ts": "export const db = {} as never;",
  });

  test("a child-data read three hops away fails, and the chain is reported", () => {
    const run = runGate(makeTree(chain("@/lib/ops/session")));
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("src/lib/hopThree.ts");
    expect(run.stderr).toContain("OPS-MODEL-METHOD");
    // The chain is the point. Without it the failure names a file nobody in the
    // operator programme has heard of and the fix looks like deleting a helper.
    expect(run.stderr).toContain(
      "reached from: src/app/actions/billing.ts -> src/lib/hopOne.ts -> src/lib/hopTwo.ts -> src/lib/hopThree.ts",
    );
  });

  test("reverse membership resolves a relative ops import, not just the @/ spelling", () => {
    // The reverse-membership test used to be a substring search for the literal
    // "@/lib/ops/", so the same file reaching ops by a relative path was never
    // treated as ops code and the whole chain went unscanned.
    const run = runGate(makeTree(chain("../../lib/ops/session")));
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("src/lib/hopThree.ts");
    expect(run.stderr).toContain("OPS-MODEL-METHOD");
  });

  test("negative control: the identical chain with no ops link is not scanned", () => {
    // Proves the previous two failed because of the walk and not because the
    // gate reads every file in src/ regardless.
    const files = chain("@/lib/ops/session");
    files["src/app/actions/billing.ts"] = [
      '"use server";',
      'import { schoolPanel } from "@/lib/hopOne";',
      "export async function panel() {",
      "  return schoolPanel();",
      "}",
    ].join("\n");
    delete (files as Record<string, string>)["src/lib/ops/session.ts"];
    const run = runGate(makeTree(files));
    expect(run.status, run.output).toBe(0);
  });

  test("the walk stops at src/lib/db.ts rather than reporting it for being the client", () => {
    // A narrowing the gate documents: following the declared chokepoint into
    // the client and then reporting it for being the client is a false positive
    // no clean ops tree could avoid.
    const run = runGate(
      makeTree({
        "src/lib/ops/reads.ts": [
          'import "server-only";',
          'import { db } from "@/lib/db";',
          "export const count = () => db.school.count();",
        ].join("\n"),
        "src/lib/db.ts": [
          'import { PrismaClient } from "@prisma/client";',
          "export const db = new PrismaClient();",
        ].join("\n"),
      }),
    );
    expect(run.status, run.output).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. The zero-scanned-files anti-rot assertion.
//
// The single most likely way this gate quietly stops working: somebody renames
// or moves a directory, the scan matches nothing, and the build goes green
// forever. Absence of the roots is fine (that is the state before PR1);
// presence with no code in it is rot.
// ---------------------------------------------------------------------------
test.describe("A15.2 the zero-scanned-files anti-rot assertion", () => {
  test("no ops root at all is a clean pass, which is the state before PR1", () => {
    const run = runGate(makeTree({ "src/lib/db.ts": "export const db = {} as never;" }));
    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("No ops root exists yet");
  });

  test("a root that exists but holds no scannable code fails", () => {
    const run = runGate(
      makeTree({ "src/lib/ops/README.md": "# moved to src/lib/platform, sorry\n" }),
    );
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("OPS-SCAN-EMPTY");
    expect(run.stderr).toContain("src/lib/ops");
  });

  test("one populated root does not excuse another empty one", () => {
    // The per-root count matters: a whole-scan count of "not zero" would let a
    // renamed directory hide behind a populated sibling.
    const run = runGate(
      makeTree({
        "src/lib/ops/reads.ts": 'import "server-only";\nexport const NOTE = "ok";',
        "src/app/ops/.keep": "",
      }),
    );
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("OPS-SCAN-EMPTY");
    expect(run.stderr).toContain("src/app/ops");
  });

  test("positive control: the same root with one code file passes and reports the count", () => {
    const run = runGate(
      makeTree({ "src/lib/ops/reads.ts": 'import "server-only";\nexport const NOTE = "ok";' }),
    );
    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain("src/lib/ops: 1");
  });
});

// ---------------------------------------------------------------------------
// 3. Schema drift, in both directions.
//
// Model names and denied field names are derived from prisma/schema.prisma at
// runtime so that a migration cannot silently widen what ops may read. That
// only holds if drift really fails the build, and drift needs a real modified
// schema to demonstrate.
// ---------------------------------------------------------------------------
test.describe("A15.3 schema drift fails in both directions", () => {
  test("a new model classified nowhere fails: unknown means denied", () => {
    const schema = `${REAL_SCHEMA}\n\nmodel Widget {\n  id   String @id\n  name String\n}\n`;
    const run = runGate(makeTree({}, schema));
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("OPS-MODEL-UNKNOWN");
    expect(run.stderr).toContain('model "Widget"');
  });

  test("a renamed model fails both ways at once: stale entry and unknown model", () => {
    const schema = REAL_SCHEMA.replace("model BillingEvent {", "model BillingEventLog {");
    expect(schema).not.toBe(REAL_SCHEMA);
    const run = runGate(makeTree({}, schema));
    expect(run.status, run.output).toBe(1);
    // Direction one: the classification names a model that no longer exists, so
    // the entry is protecting nothing.
    expect(run.stderr).toContain("OPS-CLASS-STALE");
    expect(run.stderr).toContain('"BillingEvent"');
    // Direction two: the model that replaced it is classified nowhere.
    expect(run.stderr).toContain("OPS-MODEL-UNKNOWN");
    expect(run.stderr).toContain('"BillingEventLog"');
  });

  test("a renamed denied field fails: one rename must not empty the denylist", () => {
    const schema = REAL_SCHEMA.replace(
      /^(\s*)caption(\s+String\?)/m,
      "$1captionText$2",
    );
    expect(schema).not.toBe(REAL_SCHEMA);
    const run = runGate(makeTree({}, schema));
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("OPS-DENYLIST-STALE");
    expect(run.stderr).toContain('"caption"');
  });

  test("a new credential-shaped column that nobody classified fails", () => {
    const schema = REAL_SCHEMA.replace(
      /^(model Teacher \{)$/m,
      "$1\n  recoverySecret String?",
    );
    expect(schema).not.toBe(REAL_SCHEMA);
    const run = runGate(makeTree({}, schema));
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("OPS-DENYLIST-DRIFT");
    expect(run.stderr).toContain("recoverySecret");
  });

  test("a pending denylist entry goes live the day the column lands", () => {
    // pinHash is named in the SAFEGUARDING amendments and is not a column yet.
    // Until it lands the gate prints a reminder; the day it lands the reminder
    // changes, and the identifier was already being matched all along.
    const before = runGate(makeTree({}));
    expect(before.status, before.output).toBe(0);
    expect(before.stdout).toContain('"pinHash" is still pending');

    const schema = REAL_SCHEMA.replace(/^(model Teacher \{)$/m, "$1\n  pinHash String?");
    expect(schema).not.toBe(REAL_SCHEMA);
    const after = runGate(makeTree({}, schema));
    expect(after.status, after.output).toBe(0);
    expect(after.stdout).toContain("has landed in the schema");
  });

  test("a model classified twice fails: the classes are disjoint by design", () => {
    // The only drift check that cannot be provoked from the schema side, since
    // it is a mistake in the gate's own classification rather than in the data
    // model. Provoked from a throwaway copy of the gate instead, so that no
    // rule id in this file is left with nothing asserting it.
    const source = readFileSync(GATE, "utf8");
    // The mutation is found by shape rather than by an exact source line. It
    // used to match `const LOOKUP_ONLY = ["Parent"];` verbatim, which meant this
    // test broke the first time anybody classified a new model, which is a
    // normal and expected act rather than a regression. PR5 classifying
    // MailSuppression is what surfaced it. Every assertion below is unchanged:
    // the test still mutates the gate so that one model sits in two classes,
    // still requires exit 1, and still requires the rule id and the model name
    // in stderr. Only the way it locates the list is looser.
    const decl = /const LOOKUP_ONLY = \[[\s\S]*?\];/;
    expect(source, "the LOOKUP_ONLY declaration should be findable").toMatch(decl);
    const dir = mkdtempSync(path.join(tmpdir(), "ops-blindness-mutant-"));
    trees.push(dir);
    const script = path.join(dir, "mutant.mjs");
    // Teacher is ADULT_READABLE, so naming it here puts one model in two
    // classes, which is exactly what OPS-CLASS-DUPLICATE exists to catch.
    writeFileSync(script, source.replace(decl, 'const LOOKUP_ONLY = ["Parent", "Teacher"];'));
    const run = runGate(REPO, [], script);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("OPS-CLASS-DUPLICATE");
    expect(run.stderr).toContain('"Teacher" is in more than one class');
  });

  test("a broken schema stops the gate rather than letting it pass empty", () => {
    const dir = makeTree({});
    rmSync(path.join(dir, "prisma", "schema.prisma"));
    const run = runGate(dir);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("schema.prisma not found");
  });
});

// ---------------------------------------------------------------------------
// 4. Is --self-test honest?
//
// A self-test that cannot fail is a decoration with a tick next to it. These
// cases assert it fails for each way the corpus can stop proving anything.
// ---------------------------------------------------------------------------
test.describe("A15.4 the self-test fails when the corpus stops proving anything", () => {
  const withCorpus = (fixtures: Record<string, string>) =>
    makeTree(
      Object.fromEntries(
        Object.entries(fixtures).map(([name, body]) => [
          `tests/fixtures/ops-blindness/${name}`,
          body,
        ]),
      ),
    );

  test("a missing corpus directory fails", () => {
    const run = runGate(makeTree({}), ["--self-test"]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("does not exist");
  });

  test("an empty corpus directory fails rather than passing silently", () => {
    const dir = makeTree({ "tests/fixtures/ops-blindness/.keep": "" });
    const run = runGate(dir, ["--self-test"]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("holds no fixtures");
  });

  test("an all-violating corpus fails: a gate that fails on everything is useless", () => {
    const run = runGate(withCorpus({ "bad-one.txt": MINIMAL_BAD }), ["--self-test"]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("the corpus needs both kinds");
  });

  test("an all-clean corpus fails: nobody has seen the gate fire", () => {
    const run = runGate(withCorpus({ "good-one.txt": MINIMAL_GOOD }), ["--self-test"]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("the corpus needs both kinds");
  });

  test("a violating fixture that fires the WRONG rule fails", () => {
    // The failure mode this catches is the quiet one: a fixture that fires
    // something, so the corpus looks bigger, while proving nothing about the
    // rule it claims to cover.
    const wrong = MINIMAL_BAD.replace("OPS-PRISMA-IMPORT", "OPS-IMPERSONATION");
    const run = runGate(withCorpus({ "bad-one.txt": wrong, "good-one.txt": MINIMAL_GOOD }), [
      "--self-test",
    ]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("expected OPS-IMPERSONATION to fire and it did not");
    expect(run.stderr).toContain("Fired: OPS-PRISMA-IMPORT");
  });

  test("a violating fixture with no @expect header fails", () => {
    const noExpect = MINIMAL_BAD.split("\n").filter((l) => !l.includes("@expect")).join("\n");
    const run = runGate(withCorpus({ "bad-one.txt": noExpect, "good-one.txt": MINIMAL_GOOD }), [
      "--self-test",
    ]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain('must declare "// @expect: RULE-ID"');
  });

  test("a fixture with no @path header fails, because the root-only rules need it", () => {
    const noPath = MINIMAL_GOOD.split("\n").filter((l) => !l.includes("@path")).join("\n");
    const run = runGate(withCorpus({ "bad-one.txt": MINIMAL_BAD, "good-one.txt": noPath }), [
      "--self-test",
    ]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain('no "// @path:" header');
  });

  test("a clean fixture that actually violates fails", () => {
    const notClean = `// @path: src/app/ops/page.tsx\nimport { db } from "@/lib/db";\n`;
    const run = runGate(withCorpus({ "bad-one.txt": MINIMAL_BAD, "good-one.txt": notClean }), [
      "--self-test",
    ]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("clean fixture was flagged");
  });

  test("a fixture named neither bad- nor good- fails rather than being skipped", () => {
    const run = runGate(
      withCorpus({
        "bad-one.txt": MINIMAL_BAD,
        "good-one.txt": MINIMAL_GOOD,
        "wip-two.txt": MINIMAL_BAD,
      }),
      ["--self-test"],
    );
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain('must start with "bad-" or "good-"');
  });

  test("a self-test run on a drifted schema refuses to report a trustworthy result", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ops-blindness-"));
    trees.push(dir);
    mkdirSync(path.join(dir, "prisma"), { recursive: true });
    writeFileSync(
      path.join(dir, "prisma", "schema.prisma"),
      `${REAL_SCHEMA}\n\nmodel Widget {\n  id String @id\n}\n`,
    );
    mkdirSync(path.join(dir, "tests", "fixtures", "ops-blindness"), { recursive: true });
    writeFileSync(path.join(dir, "tests/fixtures/ops-blindness/bad-one.txt"), MINIMAL_BAD);
    writeFileSync(path.join(dir, "tests/fixtures/ops-blindness/good-one.txt"), MINIMAL_GOOD);
    const run = runGate(dir, ["--self-test"]);
    expect(run.status, run.output).toBe(1);
    expect(run.stderr).toContain("cannot be trusted");
  });
});

// ---------------------------------------------------------------------------
// 5. Every rule the corpus claims to cover is load-bearing.
//
// The self-test asserts that each declared rule fires. It cannot, on its own,
// tell you whether the corpus would notice if a rule were deleted: a fixture
// that also trips four other rules looks identical from the outside. So this
// removes one rule at a time from a throwaway copy of the gate, runs the real
// corpus against it, and requires the self-test to go red every time.
//
// It is the honest form of the red-build drill, run per rule instead of once,
// and it is what stops the corpus rotting into a set of files that happen to
// fail. If a rule is added without a fixture, this test says so by name.
// ---------------------------------------------------------------------------
test.describe("A15.5 removing any single rule turns the self-test red", () => {
  const declared = [
    ...new Set(
      readdirSync(CORPUS)
        .filter((f) => f.startsWith("bad-") && f.endsWith(".txt"))
        .flatMap((f) =>
          [...readFileSync(path.join(CORPUS, f), "utf8").matchAll(/^\/\/\s*@expect:\s*(\S+)/gm)].map(
            (m) => m[1],
          ),
        ),
    ),
  ].sort();

  test("the corpus declares a meaningful number of distinct rules", () => {
    // Guards against this whole describe block silently becoming empty if the
    // corpus or the header convention is ever refactored.
    expect(declared.length).toBeGreaterThanOrEqual(15);
  });

  for (const rule of declared) {
    test(`${rule} is load-bearing: deleting it fails the self-test`, () => {
      const source = readFileSync(GATE, "utf8");
      const marker = "const add = (index, rule, reason) => {";
      expect(source).toContain(marker);
      const mutated = source.replace(
        marker,
        `${marker}\n    if (rule === ${JSON.stringify(rule)}) return;`,
      );
      const dir = mkdtempSync(path.join(tmpdir(), "ops-blindness-mutant-"));
      trees.push(dir);
      const script = path.join(dir, "mutant.mjs");
      writeFileSync(script, mutated);
      // cwd is the repository, so the mutant runs against the real corpus.
      const run = runGate(REPO, ["--self-test"], script);
      expect(run.status, `deleting ${rule} did not fail the self-test:\n${run.output}`).toBe(1);
      expect(run.stderr).toContain(`expected ${rule} to fire and it did not`);
    });
  }
});
