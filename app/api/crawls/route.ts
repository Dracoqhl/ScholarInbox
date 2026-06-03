import { NextResponse } from "next/server";

import { createCrawlRepository } from "@/lib/crawls/repository";
import { getAppDatabase } from "@/lib/db/app-database";
import { handleRouteError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";
const STALE_RUNNING_CRAWL_MS = 30 * 60 * 1000;

export async function GET() {
  try {
    const repository = createCrawlRepository(getAppDatabase());
    await repository.failStaleRunningRuns({ olderThanMs: STALE_RUNNING_CRAWL_MS });
    const runs = await repository.list();
    return NextResponse.json({ runs });
  } catch (error) {
    return handleRouteError(error);
  }
}
