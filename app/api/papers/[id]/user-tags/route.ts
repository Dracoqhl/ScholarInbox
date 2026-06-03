import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppDatabase } from "@/lib/db/app-database";
import { createPaperRepository } from "@/lib/papers/repository";
import { handleRouteError, jsonError } from "@/lib/validation/http";

const bodySchema = z.object({
  tagIds: z.array(z.string()).max(20)
});

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = bodySchema.parse(await request.json());
    const paper = await createPaperRepository(getAppDatabase()).setUserTags(params.id, body.tagIds);
    if (!paper) return jsonError("Paper not found", 404);
    return NextResponse.json({ paper });
  } catch (error) {
    return handleRouteError(error);
  }
}
