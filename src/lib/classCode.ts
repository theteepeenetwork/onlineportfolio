import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { CODE_ALPHABET, CODE_LENGTH } from "@/lib/classCodeChars";

export function makeClassCode(length = CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// Generate a class code that isn't already in use.
export async function uniqueClassCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = makeClassCode();
    const existing = await db.class.findUnique({ where: { classCode: code } });
    if (!existing) return code;
  }
  throw new Error("Couldn't generate a class code — please try again.");
}
