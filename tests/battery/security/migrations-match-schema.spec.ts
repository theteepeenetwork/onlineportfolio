import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// ===========================================================================
// OPS-0c: prisma/migrations must describe prisma/schema.prisma exactly.
//
// Production applies schema changes with `prisma migrate deploy`, which runs
// only the SQL that is committed under prisma/migrations. Local development and
// CI still use `prisma db push`, which reads schema.prisma directly and never
// looks at the migrations folder at all.
//
// That difference is the trap. Edit schema.prisma, push it locally, watch every
// test go green, deploy, and `migrate deploy` finds nothing new to apply. The
// container then boots against last week's tables and fails on the first
// request that touches the new column, at whatever time of the morning the
// deploy went out, on a database with no backups.
//
// This spec closes the trap by asserting that the committed migrations and the
// committed schema still describe the same database. It fails the moment a
// schema edit arrives without its migration, which is a red build rather than a
// broken deploy. The remedy when it goes red is to generate the migration, not
// to relax this.
// ===========================================================================

const REPO = process.cwd();
const MIGRATIONS = path.join(REPO, "prisma", "migrations");
const SCHEMA = path.join(REPO, "prisma", "schema.prisma");

// --exit-code makes `migrate diff` report 0 for "identical" and 2 for "these
// differ", instead of printing a script and exiting 0 either way.
const IDENTICAL = 0;
const DIFFERENT = 2;

function diffExitCode(toSchema: string, shadowDb: string): number {
  try {
    execFileSync(
      "npx",
      [
        "prisma",
        "migrate",
        "diff",
        "--from-migrations",
        MIGRATIONS,
        "--to-schema-datamodel",
        toSchema,
        // Replaying the migrations needs a scratch database to replay them into.
        // It is created, used and thrown away; it is never the real one.
        "--shadow-database-url",
        `file:${shadowDb}`,
        "--exit-code",
      ],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return IDENTICAL;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

test.describe("A20: the committed migrations still match the committed schema", () => {
  test.describe.configure({ timeout: 120_000 });

  test("no drift between prisma/migrations and prisma/schema.prisma", () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "sj-migrate-diff-"));
    try {
      const code = diffExitCode(SCHEMA, path.join(scratch, "shadow.db"));
      expect(
        code,
        "schema.prisma has changed without a migration. Generate one with `prisma migrate dev --name <what-changed>`; do not weaken this check.",
      ).toBe(IDENTICAL);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  // ---- Positive control, on the same resource -----------------------------
  test("positive control: the same check really does detect a drifted schema", () => {
    // Without this, a comparison that silently stopped working (a moved folder,
    // a changed flag, a Prisma version that no longer honours --exit-code) would
    // report "no drift" forever and the test above would be decoration.
    const scratch = mkdtempSync(path.join(tmpdir(), "sj-migrate-drift-"));
    try {
      const drifted = path.join(scratch, "drifted.prisma");
      writeFileSync(
        drifted,
        `${readFileSync(SCHEMA, "utf8")}\n\nmodel DriftCanary {\n  id String @id\n}\n`,
      );
      const code = diffExitCode(drifted, path.join(scratch, "shadow.db"));
      expect(code, "the drift check did not notice an added model").toBe(DIFFERENT);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
