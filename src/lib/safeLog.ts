// ---------------------------------------------------------------------------
// Turning a caught error into something safe to write to stdout.
//
// Application stdout goes to Railway's log store: a third party's system, with
// its own retention and its own access model, that nobody at Storyjar can grep
// for a child's name later and remove. So the rule is that a log line carries
// ids, counts and fixed phrases, and never contents.
//
// `console.error("...", e)` breaks that rule silently. The error object is not
// a string of your choosing, it is whatever the library decided to put in it:
//
//  • A Prisma validation error prints the ENTIRE argument object it rejected.
//    For `db.auditLog.create` that includes `detail`, which routinely holds a
//    child's first name, and `actorName`.
//  • A Stripe error echoes back the parameter it objected to, which on customer
//    creation is the adult's email address.
//  • Any error printed with its stack can carry a token or a media path that
//    happened to be in scope.
//
// None of that is visible at the call site, which is exactly why it survives
// review. This module exists so the safe form is shorter to write than the
// unsafe one.
//
// Deliberately free of `server-only`, so the blocking spec
// tests/battery/security/log-hygiene.spec.ts can import it and prove it.
// ---------------------------------------------------------------------------

// An error class name: letters and digits, nothing else, length-capped. A real
// class name always matches; a message that has been assigned over `name` by a
// library, or an error whose name is a string of user input, never does.
const CLASS_NAME = /^[A-Za-z][A-Za-z0-9]{0,59}$/;

// A machine code such as Prisma's "P2002" or Stripe's "resource_missing".
// Underscores, dots and hyphens are allowed; a space, an "@" or a "/" is not,
// which is what rules out an address, a path and a sentence.
const MACHINE_CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/;

/**
 * A one-token description of an error, safe to print.
 *
 * Returns the error's class name, and its machine code where the library
 * provides a recognisable one: `PrismaClientKnownRequestError/P2002`. It never
 * returns the message, the stack, the offending arguments or the object itself.
 *
 * Use it as `console.error("[thing] what failed", errorLabel(e))`. When the
 * label alone is not enough to debug an incident, the answer is an audit row or
 * a metric, not a fuller log line.
 */
export function errorLabel(e: unknown): string {
  if (typeof e !== "object" || e === null) return "unknown";

  const err = e as { name?: unknown; code?: unknown };
  const name = typeof err.name === "string" && CLASS_NAME.test(err.name) ? err.name : "Error";
  const code = typeof err.code === "string" && MACHINE_CODE.test(err.code) ? err.code : null;

  return code ? `${name}/${code}` : name;
}
