import "server-only";
import { db } from "@/lib/db";
import { makeFamilyCode } from "@/lib/familyCodeMint";

// The pure minting half now lives in `familyCodeMint.ts` and is re-exported
// here so every existing caller is unchanged. It was split out in PR4 because
// the operator area needs the same generator and may not import a module that
// touches Prisma. See the header of that file.
export { makeFamilyCode };

// Generate a family code that isn't already in use.
export async function uniqueFamilyCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = makeFamilyCode();
    const existing = await db.parent.findUnique({ where: { familyCode: code } });
    if (!existing) return code;
  }
  throw new Error("Couldn't generate a family code. Please try again.");
}
