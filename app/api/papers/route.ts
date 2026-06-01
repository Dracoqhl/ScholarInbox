import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAppDatabase } from "@/lib/db/app-database";
import { createPaperRepository } from "@/lib/papers/repository";
import { handleRouteError } from "@/lib/validation/http";

const querySchema = z.object({
  favorite: z.enum(["true", "false"]).optional(),
  status: z.enum(["new", "interested", "reading", "done", "archived"]).optional(),
  query: z.string().optional()
});

export async function GET(request: NextRequest) {
  try {
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const papers = await createPaperRepository(getAppDatabase()).list({
      favorite: query.favorite ? query.favorite === "true" : undefined,
      status: query.status,
      query: query.query
    });
    return NextResponse.json({ papers });
  } catch (error) {
    return handleRouteError(error);
  }
}
