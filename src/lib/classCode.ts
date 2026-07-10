import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";

// Unambiguous characters only — no 0/O, 1/I/L etc. — so a class code is easy
// for a young child to read and type.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeClassCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
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
