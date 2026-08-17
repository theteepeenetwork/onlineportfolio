// The operator door's user-facing strings.
//
// In its own module, free of `import "server-only"`, for two reasons. The
// blocking spec asserts that every failure cause produces the SAME sentence,
// and it can only do that honestly by importing the sentence rather than
// copying it (a copy drifts, and a drifted copy makes the test pass while the
// screen says something else). And a client component renders it.
//
// ONE STRING FOR EVERY CAUSE, and the list of causes is the point: unknown
// address, wrong password, wrong code, reused code, expired step, disabled
// account, locked account. "This account is locked" is "this account exists",
// and "no such address" is an enumeration oracle. Plain English, no jargon, no
// error codes — the same standard the rest of the product is held to.

export const OPS_GENERIC_FAILURE = "Those details were not recognised. Check them and try again.";
