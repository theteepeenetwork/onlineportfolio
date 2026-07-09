import { PrismaClient } from "@prisma/client";

// A single shared Prisma client. In development Next.js reloads modules on
// every change, so we stash the client on `globalThis` to avoid opening a new
// database connection each time.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
