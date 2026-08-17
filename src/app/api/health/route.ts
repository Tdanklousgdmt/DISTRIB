import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { auddConfigured, resendConfigured, yousignConfigured } from "@/lib/env";
import { storageConfigured, storageDriver } from "@/lib/storage";
import { blockchainEnabled } from "@/lib/blockchain";

// GET /api/health — utilisé par le healthcheck Railway et pour diagnostiquer
// quels services sont provisionnés. Ne révèle aucun secret.
export async function GET() {
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const body = {
    ok: database,
    services: {
      database,
      storage: storageConfigured() ? storageDriver() : false,
      resend: resendConfigured(),
      blockchain: blockchainEnabled(),
      yousign: yousignConfigured(),
      audd: auddConfigured(),
    },
  };

  return NextResponse.json(body, { status: database ? 200 : 503 });
}
