// The shape of a family code, and how a typed one is normalised.
//
// Split out of `familyCode.ts` (which is `server-only`, because it generates
// codes and hits the database) for the same reason `classCodeChars.ts` is split
// out of `classCode.ts`: the sign-in forms and the tests need the normaliser,
// and neither can import a server-only module.
//
// The alphabet is the class-code alphabet, deliberately. It exists because a
// young child reading a code off the board must not confuse two glyphs, and a
// parent reading a code off a letter has exactly the same problem, often in
// worse light, often on a phone. One unambiguous alphabet, one place to change
// it.
import { CODE_ALPHABET } from "@/lib/classCodeChars";

export { CODE_ALPHABET as FAMILY_CODE_ALPHABET };

// Longer than a class code (6). A class code opens a name wall inside a
// classroom and is meant to be seen; a family code is a single-factor
// credential that reaches one household on paper and opens that child's
// photographs. Eight characters of this alphabet is ~852 billion codes against
// ~887 million, which is what makes the throttle on the entry form a backstop
// rather than the only thing standing in the way.
export const FAMILY_CODE_LENGTH = 8;

// A parent may type the code with the spaces or dashes they see on the letter,
// in lower case, with a trailing space from a paste. None of that is a wrong
// code, so normalise before looking it up rather than turning them away.
export function normaliseFamilyCode(raw: string | undefined | null): string {
  return (raw ?? "").replace(/[\s-]+/g, "").toUpperCase();
}
