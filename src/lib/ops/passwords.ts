// Password handling for the operator door.
//
// bcrypt at cost 12, minimum 12 characters. The rest of the app hashes teacher
// passwords with bcryptjs too (SAFEGUARDING rule 13: "passwords are hashed with
// bcrypt"), so this is the same primitive at a higher cost for the one account
// that can reach every school's billing state.
//
// Free of `import "server-only"`: scripts/seed-operator.ts runs under tsx and
// needs to hash, and the blocking spec asserts the stored hash's cost factor.
// Nothing here touches a cookie, a request or the database.
import bcrypt from "bcryptjs";

export const OPS_BCRYPT_COST = 12;
export const OPS_MIN_PASSWORD_LENGTH = 12;

// A real bcrypt hash at the SAME cost factor, compared against when the address
// is unknown so that "no such operator" and "wrong password" take the same
// time. A cheaper dummy, or skipping the compare entirely, turns the sign-in
// form into an address oracle: two hundred milliseconds is a very loud
// difference over a hundred requests.
//
// It is a hash of a fixed, published string and is not a credential: nothing
// authenticates against it, because the code path that uses it always fails.
export const OPS_DUMMY_HASH = "$2b$12$.TMgu5JEPobHMP595cCq8.5xuyQbgBz6L2V5tdXZWcC/utSTONuLG";

export async function hashOperatorPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, OPS_BCRYPT_COST);
}

export async function operatorPasswordMatches(plain: string, pwHash: string): Promise<boolean> {
  return bcrypt.compare(plain, pwHash);
}

// Burn the same work when the address is unknown, and always answer no.
export async function burnEqualWork(plain: string): Promise<false> {
  await bcrypt.compare(plain, OPS_DUMMY_HASH);
  return false;
}

export function passwordPolicyProblem(plain: string): string | null {
  if (plain.length < OPS_MIN_PASSWORD_LENGTH) {
    return `an operator password must be at least ${OPS_MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
