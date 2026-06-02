import { NextResponse } from "next/server";

import { getAppDatabase } from "@/lib/db/app-database";
import { generateAndStorePdfAnalysis } from "@/lib/pdf-analysis/service";
import { createPaperRepository } from "@/lib/papers/repository";
import { handleRouteError, jsonError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const paperRepository = createPaperRepository(getAppDatabase());
    const paper = await paperRepository.get(params.id);
    if (!paper) return jsonError("Paper not found", 404);

    const updated = await generateAndStorePdfAnalysis({ paperRepository, paper });
    return NextResponse.json({ paper: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
