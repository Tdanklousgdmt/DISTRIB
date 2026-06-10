import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 : le client `prisma-client` (queryCompiler) requiert un driver
// adapter natif. Pour Supabase Postgres → @prisma/adapter-pg, alimenté par
// DATABASE_URL (pooler transaction, port 6543).
function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

// Singleton — évite d'ouvrir N connexions Postgres en dev avec le HMR de Next.
declare global {
  // eslint-disable-next-line no-var
  var prismaClient: ReturnType<typeof createClient> | undefined;
}

export const prisma = globalThis.prismaClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}
