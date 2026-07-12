#!/usr/bin/env node
// A5 tripwire — make it impossible to ship the Cloudflare R2 migration without
// turning the R2 security specs back on.
//
// If R2 code/config has landed in the repo (an @aws-sdk/S3 client, an R2 env
// var, a signer) but tests/battery/security/r2-signed-urls.spec.ts is still
// skipped, FAIL the build. This stops the "we'll enable the tests later" trap.
//
// Usage: node scripts/check-r2-tripwire.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const R2_SIGNALS = [
  /@aws-sdk\/client-s3/,
  /@aws-sdk\/s3-request-presigner/,
  /R2_BUCKET|R2_ACCOUNT_ID|R2_ACCESS_KEY/,
  /getSignedUrl\s*\(/,
  /\.r2\.cloudflarestorage\.com/,
];

let r2Present = false;
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      const text = readFileSync(full, "utf8");
      if (R2_SIGNALS.some((re) => re.test(text))) r2Present = true;
    }
  }
}
walk(SRC);

// Is the R2 spec still skipped?
const specPath = path.join(process.cwd(), "tests", "battery", "security", "r2-signed-urls.spec.ts");
const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : "";
const stillSkipped = /test\.skip\(!R2_ENABLED/.test(spec);

if (r2Present && stillSkipped) {
  console.error(
    "✖ R2 code detected in src/ but tests/battery/security/r2-signed-urls.spec.ts is still skipped.\n" +
      "  Enable the R2 security specs (remove the skip / set R2_BUCKET) before shipping R2.\n" +
      "  See TEST_PLAN.md A5 and SAFEGUARDING.md rules 7 & 10.",
  );
  process.exit(1);
}

console.log(
  r2Present
    ? "✓ R2 code present and its security specs are active."
    : "✓ R2 not present yet — specs correctly parked (skipped-ready).",
);
