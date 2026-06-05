import { NextResponse } from "next/server";

import { getAppDatabase } from "@/lib/db/app-database";
import { createTopicSearchRepository } from "@/lib/topic-search/repository";
import { handleRouteError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const run = await createTopicSearchRepository(getAppDatabase()).getRun(context.params.id);
    if (!run) return NextResponse.json({ error: "Topic search run not found." }, { status: 404 });
    return NextResponse.json({ run });
  } catch (error) {
    return handleRouteError(error);
  }
}
