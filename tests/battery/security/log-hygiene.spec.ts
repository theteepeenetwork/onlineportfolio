import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { errorLabel } from "@/lib/safeLog";

// ===========================================================================
// OPS-0d: what the application writes to stdout.
//
// Stdout goes to Railway's log store. That is a third party's system with its
// own retention and its own access model, and once a child's first name is in
// it, nobody at Storyjar can take it back out. SAFEGUARDING rule 8 is explicit
// that an error must never leak another user's data "in error messages, logs,
// or responses", and rule 10 puts logs in the same UK/EU sentence as the
// database and the media.
//
// The realistic leak is not someone deciding to log a child's name. It is
// `console.error("...", e)`, where `e` is an object the caller never inspected:
// a Prisma validation error prints the whole rejected argument object, which
// for an audit write includes `detail` and `actorName`; a Stripe error echoes
// back the parameter it objected to, which on customer creation is an adult's
// email address. Neither is visible at the call site.
//
// Two halves here, and they need each other. The unit half proves the safe
// labeller really strips the payload. The static half proves the codebase
// actually uses it, because a helper nobody calls protects nothing.
//
// WHAT THIS DOES NOT COVER. The static half scans `src/` only, which is the
// application's own stdout. Scripts under `scripts/` print deliberately, and
// some of them exist precisely to show an operator a masked address or a
// delivery status, so a blanket rule there would be wrong. They were audited by
// hand in OPS-0d instead: `mail-events.mjs` masks by default with an explicit
// `--full` opt-out, and `fix-demo-parent-address.mjs` was changed to print row
// ids rather than a parent's name and their family code. A future script is not
// protected by anything here.
// ===========================================================================

test.describe("A19: nothing sensitive reaches stdout", () => {
  // ---- The labeller -------------------------------------------------------

  test("errorLabel keeps the class and the code, and nothing else", () => {
    // Positive control, on the same resource as the negatives below: the
    // labeller must still say something USEFUL. A function that returned a
    // constant would pass every leak assertion in this file and be worthless.
    const prismaShaped = Object.assign(new Error("Unique constraint failed on the fields: (`email`)"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
    });
    expect(errorLabel(prismaShaped)).toBe("PrismaClientKnownRequestError/P2002");

    const stripeShaped = Object.assign(new Error("No such customer: cus_123"), {
      name: "StripeInvalidRequestError",
      code: "resource_missing",
    });
    expect(errorLabel(stripeShaped)).toBe("StripeInvalidRequestError/resource_missing");

    expect(errorLabel(new Error("anything at all"))).toBe("Error");
  });

  test("errorLabel never returns the message, whatever is in it", () => {
    // One case per category OPS-0d bans from stdout.
    const secrets = [
      "Invalid `db.auditLog.create()` invocation: detail: 'Approved Amara's painting'",
      "No such customer for email parent@example.com",
      "GET /family/sign-in?token=8f3c1d2e9b7a4655aa01bc23de45f678 failed",
      "family code FAM123 rejected",
      "class code SUN234 not found",
      "pinHash $2b$10$abcdefghijklmnopqrstuv mismatch",
      "ENOENT: /data/media/0f2c9a11b3d84e77.png",
    ];
    for (const message of secrets) {
      const label = errorLabel(new Error(message));
      expect(label, `errorLabel leaked: ${message}`).toBe("Error");
    }
  });

  test("errorLabel refuses a name or code that is really a payload", () => {
    // A library can assign anything to `name` or `code`. Only a class-shaped
    // name and a machine-shaped code survive; a sentence or an address does not.
    const smuggled = Object.assign(new Error("x"), {
      name: "Amara Okonkwo",
      code: "parent@example.com",
    });
    expect(errorLabel(smuggled)).toBe("Error");
    expect(errorLabel("a bare string with a token 8f3c1d2e")).toBe("unknown");
    expect(errorLabel(null)).toBe("unknown");
  });

  // ---- The codebase actually uses it --------------------------------------

  test("no console call in src/ passes a caught error object", () => {
    const offenders = scanSrc((line) => {
      if (!/console\.(log|info|warn|error|debug)\s*\(/.test(line)) return false;
      // The banned shape: the error binding handed straight to console.
      return /,\s*(e|err|error|ex)\s*\)/.test(line);
    });
    expect(
      offenders,
      "pass errorLabel(e) instead: the raw object prints whatever the library put in it",
    ).toEqual([]);
  });

  test("no console call in src/ logs an email address or a part of one", () => {
    const offenders = scanSrc((line) => {
      if (!/console\.(log|info|warn|error|debug)\s*\(/.test(line)) return false;
      // A VALUE, not the word. "[mailer] email not sent" is a fixed phrase and
      // carries nothing; `${to}` and `domainOf(to)` carry a family's identity.
      return (
        /domainOf/.test(line) ||
        /\$\{[^}]*\b(to|email|address|recipient|toAddress)\b/i.test(line) ||
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(line)
      );
    });
    expect(
      offenders,
      "an address, and in a ten-school pilot its domain too, identifies a family",
    ).toEqual([]);
  });

  test("no console call in src/ logs a name, a code, a token, a PIN or a media path", () => {
    const offenders = scanSrc((line) => {
      if (!/console\.(log|info|warn|error|debug)\s*\(/.test(line)) return false;
      return /\b(familyCode|classCode|pinHash|magicToken|mediaPath|firstName|studentName|childName|token)\b/i.test(
        line,
      );
    });
    expect(offenders, "credentials are identifiers: a readable code signs someone in").toEqual([]);
  });
});

// Walk src/ and return "path:line  text" for every line the predicate flags.
// Comments are stripped first, so a header that describes the banned pattern
// (this rule exists because someone wrote it down) is not itself a violation.
function scanSrc(flag: (line: string) => boolean): string[] {
  const root = path.join(process.cwd(), "src");
  const hits: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) visit(full);
    }
  };

  const visit = (file: string) => {
    const rel = path.relative(process.cwd(), file);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((raw, i) => {
        const line = raw.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (/^\s*\*/.test(raw)) return; // block-comment body
        if (flag(line)) hits.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
  };

  walk(root);
  return hits;
}
