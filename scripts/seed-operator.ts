import "dotenv/config";
import { randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashOperatorPassword } from "../src/lib/ops/passwords";
import { hashRecoveryCodes, newRecoveryCodes, RECOVERY_CODE_COUNT } from "../src/lib/ops/recovery";
import { formatSecretForTyping, newTotpSecret, totpEnrolmentUri } from "../src/lib/ops/totp";

// ---------------------------------------------------------------------------
// Create the one platform operator account. Run once, by hand, per environment:
//
//     railway run npx tsx scripts/seed-operator.ts you@example.com
//
// WHAT THIS SCRIPT WILL NOT DO, AND WHY
//
//   - It will not run if an Operator row already exists. There is no --force
//     and no --reset. A script that can overwrite the operator account is a
//     script that can hand the operator account to whoever runs it, and it
//     would live in the repository being read by everyone.
//   - It will not send an email. A password or an enrolment secret in an inbox
//     is a password or an enrolment secret in an inbox. Everything is printed
//     to this terminal, once.
//   - It will not mint a session (handbook ruling R8). Nothing in this
//     repository can produce a signed-in operator without a password and a
//     code. Recovery when both are lost is a documented row deletion followed
//     by re-running this script: see docs/ops-recovery.md.
//
// It is deliberately allowed to run with NODE_ENV=production, unlike
// prisma/seed.ts, because production is the environment that needs it. It
// writes exactly one row and deletes nothing.
// ---------------------------------------------------------------------------

const REFUSED = 1;

function fail(message: string): never {
  console.error(`[seed-operator] ${message}`);
  process.exit(REFUSED);
}

// A long random password, generated here rather than chosen, because the person
// running this will otherwise reuse one. Ambiguous characters are left out: it
// gets copied off a terminal and typed into a password manager by hand.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_";
function newPassword(length = 28): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  for (const a of args) {
    if (a.startsWith("-")) fail(`there are no flags. "${a}" is not accepted; see the header of this file.`);
  }
  const email = (args[0] ?? process.env.OPS_OPERATOR_EMAIL ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail("give the operator's email address: npx tsx scripts/seed-operator.ts you@example.com");
  }

  const db = new PrismaClient();
  try {
    const existing = await db.operator.count();
    if (existing > 0) {
      console.error(`[seed-operator] refusing to run: ${existing} operator account already exists.`);
      console.error("[seed-operator] There is no --force. If you have lost access, read docs/ops-recovery.md:");
      console.error("[seed-operator] the documented route is deleting the row from the Railway shell, deliberately,");
      console.error("[seed-operator] and then running this again. Nothing was written.");
      process.exit(REFUSED);
    }

    const password = newPassword();
    const totpSecret = newTotpSecret();
    const recoveryCodes = newRecoveryCodes();

    await db.operator.create({
      data: {
        email,
        pwHash: await hashOperatorPassword(password),
        totpSecret,
        recoveryCodesJson: await hashRecoveryCodes(recoveryCodes),
        role: "OWNER",
        status: "ACTIVE",
        // Enrolment happens in the browser, after the password, the first time
        // this account signs in. Until then the account cannot complete a
        // sign-in, so a leaked password on its own is not a way in.
        totpConfirmedAt: null,
      },
    });

    const lines = [
      "",
      "  ┌───────────────────────────────────────────────────────────────────┐",
      "  │  Printed ONCE. Nothing below is recoverable from the database.    │",
      "  └───────────────────────────────────────────────────────────────────┘",
      "",
      `  Email        ${email}`,
      `  Password     ${password}`,
      "",
      `  Setup key    ${formatSecretForTyping(totpSecret)}`,
      `  Or paste     ${totpEnrolmentUri(email, totpSecret)}`,
      "",
      `  Recovery codes (${RECOVERY_CODE_COUNT}, each usable once):`,
      ...recoveryCodes.map((c) => `      ${c}`),
      "",
      "  What to do with these, in this order:",
      "    1. Put the password in your password manager.",
      "    2. Sign in. You will be asked to add the setup key to an authenticator",
      "       app and type a code back, and you cannot get past that step.",
      "    3. Print the recovery codes and put the paper somewhere physical that",
      "       does not depend on the phone holding the authenticator app. Not in",
      "       this repository, not in an email, not in the same password manager",
      "       that the lost phone unlocks.",
      "    4. Close this terminal. Clear its scrollback if it is shared.",
      "",
      "  If you lose all three, read docs/ops-recovery.md. The way back is",
      "  deleting this row and running this script again; there is no reset link,",
      "  by design.",
      "",
    ];
    console.log(lines.join("\n"));
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
