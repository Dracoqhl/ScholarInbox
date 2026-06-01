import { NextResponse } from "next/server";

import { getAppDatabase } from "@/lib/db/app-database";
import { createPaperRepository } from "@/lib/papers/repository";
import { handleRouteError, jsonError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const paper = await createPaperRepository(getAppDatabase()).get(params.id);
    if (!paper) return jsonError("Paper not found", 404);
    return NextResponse.json({ paper });
  } catch (error) {
    return handleRouteError(error);
  }
}
