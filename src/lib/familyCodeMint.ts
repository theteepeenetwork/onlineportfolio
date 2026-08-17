import { randomInt } from "node:crypto";
import { FAMILY_CODE_ALPHABET, FAMILY_CODE_LENGTH } from "@/lib/familyCodeChars";

// Minting one family code, and nothing else.
//
// WHY THIS IS ITS OWN FILE (PR4)
//
// `familyCode.ts` does two things: it mints a code, and it asks the database
// whether that code is already in use. The second half makes the whole module
// `server-only` and gives it a Prisma import, and the operator area may not
// import a module that touches Prisma: the blindness gate walks every local
// import from the ops roots and refuses the client wherever it finds it, which
// is the rule working rather than an obstacle.
//
// So the pure half moved here and `familyCode.ts` now imports it. One alphabet,
// one length, one RNG choice, used by the teacher's own rotation and by the
// operator's, which is what "reuse the logic" has to mean if it is to mean
// anything: two generators that agreed on the day they were written and drifted
// afterwards would be worse than one obvious duplication.
//
// `randomInt` is the crypto RNG, not Math.random. This value is a credential:
// whoever holds it can open one child's jar until it is replaced.

export function makeFamilyCode(length = FAMILY_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += FAMILY_CODE_ALPHABET[randomInt(FAMILY_CODE_ALPHABET.length)];
  }
  return code;
}
