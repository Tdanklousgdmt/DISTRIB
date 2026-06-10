import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { auddConfigured, resendConfigured, s3Configured, yousignConfigured } from "@/lib/env";
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
      s3: s3Configured(),
      resend: resendConfigured(),
      blockchain: blockchainEnabled(),
      yousign: yousignConfigured(),
      audd: auddConfigured(),
    },
  };

  return NextResponse.json(body, { status: database ? 200 : 503 });
}
