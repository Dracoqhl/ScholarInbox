import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppDatabase } from "@/lib/db/app-database";
import { createPaperRepository } from "@/lib/papers/repository";
import { handleRouteError, jsonError } from "@/lib/validation/http";

const bodySchema = z.object({
  status: z.enum(["new", "interested", "reading", "done", "archived"])
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = bodySchema.parse(await request.json());
    const paper = await createPaperRepository(getAppDatabase()).setStatus(params.id, body.status);
    if (!paper) return jsonError("Paper not found", 404);
    return NextResponse.json({ paper });
  } catch (error) {
    return handleRouteError(error);
  }
}
