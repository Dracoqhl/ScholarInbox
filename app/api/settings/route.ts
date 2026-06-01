import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppDatabase } from "@/lib/db/app-database";
import { createSettingsRepository } from "@/lib/settings/repository";
import { handleRouteError } from "@/lib/validation/http";

const settingsSchema = z.object({
  categories: z.array(z.string().min(1)).min(1),
  dailyCrawlTime: z.string().regex(/^\d{2}:\d{2}$/),
  interestProfile: z.string().min(1)
});

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await createSettingsRepository(getAppDatabase()).get();
    return NextResponse.json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const input = settingsSchema.parse(await request.json());
    const settings = await createSettingsRepository(getAppDatabase()).update(input);
    return NextResponse.json({ settings });
  } catch (error) {
    return handleRouteError(error);
  }
}
