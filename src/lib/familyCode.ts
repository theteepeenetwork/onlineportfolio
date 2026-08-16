import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { FAMILY_CODE_ALPHABET, FAMILY_CODE_LENGTH } from "@/lib/familyCodeChars";

// Mirrors makeClassCode/uniqueClassCode in `classCode.ts`. `randomInt` is the
// crypto RNG, not Math.random: this code is a credential.
export function makeFamilyCode(length = FAMILY_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += FAMILY_CODE_ALPHABET[randomInt(FAMILY_CODE_ALPHABET.length)];
  }
  return code;
}

// Generate a family code that isn't already in use.
export async function uniqueFamilyCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = makeFamilyCode();
    const existing = await db.parent.findUnique({ where: { familyCode: code } });
    if (!existing) return code;
  }
  throw new Error("Couldn't generate a family code. Please try again.");
}
