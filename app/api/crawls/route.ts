import { NextResponse } from "next/server";

import { createCrawlRepository } from "@/lib/crawls/repository";
import { getAppDatabase } from "@/lib/db/app-database";
import { handleRouteError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runs = await createCrawlRepository(getAppDatabase()).list();
    return NextResponse.json({ runs });
  } catch (error) {
    return handleRouteError(error);
  }
}
