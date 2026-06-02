import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAppDatabase } from "@/lib/db/app-database";
import { createPaperRepository } from "@/lib/papers/repository";
import { handleRouteError } from "@/lib/validation/http";

const querySchema = z.object({
  favorite: z.enum(["true", "false"]).optional(),
  matched: z.enum(["true", "false", "all"]).optional(),
  status: z.enum(["new", "general", "interested", "reading", "done", "archived", "irrelevant"]).optional(),
  query: z.string().optional()
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const favorite = query.favorite ? query.favorite === "true" : undefined;
    const papers = await createPaperRepository(getAppDatabase()).list({
      favorite,
      matched: getMatchedFilter(query.matched, favorite),
      status: query.status,
      query: query.query
    });
    return NextResponse.json({ papers });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const result = await createPaperRepository(getAppDatabase()).deleteMany({
      status: query.status ?? "new",
      matched: getMatchedFilter(query.matched ?? "true", undefined)
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

function getMatchedFilter(value: "true" | "false" | "all" | undefined, favorite: boolean | undefined): boolean | undefined {
  if (value === "all") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return favorite ? undefined : true;
}
