import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ===========================================================================
// OPS-0c: the demo seed must refuse to run in production.
//
// prisma/seed.ts deletes every row in the database and then writes demo
// teachers, demo class codes and demo SVG "drawings" into MEDIA_DIR. Until now
// the only thing standing between that and a production volume was a runtime
// check that a teacher row already existed. A fresh volume, a failed restore or
// a restore paused halfway is precisely the moment that check is wrong, and it
// is also the moment the data is least recoverable.
//
// So the guard is NODE_ENV, it lives at the top of the seed file rather than in
// the caller, and FORCE_SEED does not override it.
//
// HOW THIS TEST STAYS SAFE. It runs the real seed script as a child process, so
// a broken guard would really wipe a database. It therefore points DATABASE_URL
// and MEDIA_DIR at a throwaway temporary directory: if the guard ever fails, the
// damage lands there and the assertions below catch it, rather than the battery
// fixtures quietly disappearing.
// ===========================================================================

const REPO = process.cwd();
const REFUSAL = /refusing to run/i;

function runSeed(script: string, env: Record<string, string>) {
  const scratch = mkdtempSync(path.join(tmpdir(), "sj-seed-guard-"));
  const dbFile = path.join(scratch, "throwaway.db");
  try {
    let stdout = "";
    let stderr = "";
    let code = 0;
    try {
      stdout = execFileSync("npx", ["tsx", script], {
        cwd: REPO,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...env,
          DATABASE_URL: `file:${dbFile}`,
          MEDIA_DIR: scratch,
        },
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? "";
    }
    return { code, output: `${stdout}\n${stderr}`, dbFile };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

test.describe("A18: the seed cannot run against production", () => {
  test.describe.configure({ timeout: 120_000 });

  test("prisma/seed.ts refuses when NODE_ENV is production", () => {
    const { code, output, dbFile } = runSeed("prisma/seed.ts", { NODE_ENV: "production" });
    expect(output).toMatch(REFUSAL);
    expect(code, "a refusal must be a non-zero exit, or a caller cannot tell").not.toBe(0);
    expect(existsSync(dbFile), "the seed touched a database despite refusing").toBe(false);
  });

  test("FORCE_SEED does not override the production guard", () => {
    // FORCE_SEED exists as a deliberate local escape hatch. It must not be one
    // in production: "I meant it" is exactly what someone types at the point
    // they are about to do the irreversible thing.
    const { code, output, dbFile } = runSeed("prisma/seed.ts", { NODE_ENV: "production", FORCE_SEED: "1" });
    expect(output).toMatch(REFUSAL);
    expect(code).not.toBe(0);
    expect(existsSync(dbFile)).toBe(false);
  });

  test("the two-tenant fixture seed refuses in production too", () => {
    // prisma/seed-test.ts wipes and reseeds exactly like the demo seed, and it
    // is invoked with FORCE_SEED=1 by the battery's global setup.
    const { code, output, dbFile } = runSeed("prisma/seed-test.ts", { NODE_ENV: "production", FORCE_SEED: "1" });
    expect(output).toMatch(REFUSAL);
    expect(code).not.toBe(0);
    expect(existsSync(dbFile)).toBe(false);
  });

  // ---- Control, on the same resource --------------------------------------
  test("control: NODE_ENV is what stops it, not a broken script", () => {
    // Same script, same throwaway database, only NODE_ENV differs. It must get
    // PAST the guard, and then fail for an ordinary reason (an empty scratch
    // database with no tables), which is the proof that the refusal above is
    // caused by NODE_ENV and not by the script being unable to start at all.
    const { code, output } = runSeed("prisma/seed.ts", { NODE_ENV: "development" });
    expect(output, "the guard fired outside production, which would break local setup").not.toMatch(REFUSAL);
    expect(code, "expected the ordinary no-tables failure past the guard").not.toBe(0);
  });
});
