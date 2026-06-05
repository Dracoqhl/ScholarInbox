import { NextRequest, NextResponse } from "next/server";

import { createCrawlRepository } from "@/lib/crawls/repository";
import { getAppDatabase } from "@/lib/db/app-database";
import { handleRouteError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";
const STALE_RUNNING_CRAWL_MS = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const repository = createCrawlRepository(getAppDatabase());
    await repository.failStaleRunningRuns({ olderThanMs: STALE_RUNNING_CRAWL_MS });
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const runs = await repository.list(limit ? { limit } : undefined);
    return NextResponse.json({ runs });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
