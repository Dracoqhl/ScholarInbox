import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAppDatabase } from "@/lib/db/app-database";
import { createPaperRepository } from "@/lib/papers/repository";
import { handleRouteError } from "@/lib/validation/http";

const querySchema = z.object({
  favorite: z.enum(["true", "false"]).optional(),
  matched: z.enum(["true", "false", "all"]).optional(),
  status: z.enum(["new", "archived", "irrelevant"]).optional(),
  query: z.string().optional(),
  userTagId: z.union([z.string(), z.array(z.string())]).optional(),
  keywordTag: z.union([z.string(), z.array(z.string())]).optional(),
  publishedFrom: z.string().optional(),
  publishedTo: z.string().optional()
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const query = parsePaperQuery(request);
    const favorite = query.favorite ? query.favorite === "true" : undefined;
    const papers = await createPaperRepository(getAppDatabase()).list({
      favorite,
      matched: getMatchedFilter(query.matched, favorite),
      status: query.status,
      query: query.query,
      userTagIds: normalizeMultiParam(query.userTagId),
      keywordTags: normalizeMultiParam(query.keywordTag),
      publishedFrom: query.publishedFrom,
      publishedTo: query.publishedTo
    });
    return NextResponse.json({ papers });
  } catch (error) {
    return handleRouteError(error);
  }
}

function normalizeMultiParam(value: string | string[] | undefined): string[] | undefined {
  if (!value) return undefined;
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

export async function DELETE(request: NextRequest) {
  try {
    const query = parsePaperQuery(request);
    const result = await createPaperRepository(getAppDatabase()).deleteMany({
      status: query.status ?? "new",
      matched: getMatchedFilter(query.matched ?? "true", undefined)
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}

function parsePaperQuery(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return querySchema.parse({
    ...Object.fromEntries(params),
    userTagId: getAllOrUndefined(params, "userTagId"),
    keywordTag: getAllOrUndefined(params, "keywordTag")
  });
}

function getAllOrUndefined(params: URLSearchParams, key: string): string[] | undefined {
  const values = params.getAll(key).filter(Boolean);
  return values.length ? values : undefined;
}

function getMatchedFilter(value: "true" | "false" | "all" | undefined, favorite: boolean | undefined): boolean | undefined {
  if (value === "all") return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return favorite ? undefined : true;
}
