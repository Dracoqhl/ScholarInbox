import { NextResponse } from "next/server";
import { z } from "zod";

import { crawlArxivDateRange } from "@/lib/crawls/crawler";
import { getAppDatabase } from "@/lib/db/app-database";
import { createSettingsRepository } from "@/lib/settings/repository";
import { handleRouteError } from "@/lib/validation/http";

const bodySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categories: z.array(z.string().min(1)).optional()
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const db = getAppDatabase();
    const settings = await createSettingsRepository(db).get();
    const run = await crawlArxivDateRange({
      db,
      categories: body.categories?.length ? body.categories : settings.categories,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo
    });
    return NextResponse.json({ run });
  } catch (error) {
    return handleRouteError(error);
  }
}
