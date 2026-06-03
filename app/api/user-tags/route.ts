import { NextResponse } from "next/server";
import { z } from "zod";

import { getAppDatabase } from "@/lib/db/app-database";
import { createPaperRepository } from "@/lib/papers/repository";
import { handleRouteError } from "@/lib/validation/http";

const bodySchema = z.object({
  name: z.string().min(1).max(32),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tags = await createPaperRepository(getAppDatabase()).listUserTags();
    return NextResponse.json({ tags });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const tag = await createPaperRepository(getAppDatabase()).createUserTag(body);
    return NextResponse.json({ tag });
  } catch (error) {
    return handleRouteError(error);
  }
}
