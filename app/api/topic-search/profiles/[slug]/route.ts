import { NextResponse } from "next/server";
import { z } from "zod";

import { createTopicProfileRepository } from "@/lib/topic-search/profile-repository";
import { TOPIC_SEARCH_SOURCES } from "@/lib/topic-search/profile";
import { handleRouteError } from "@/lib/validation/http";

const bodySchema = z.object({
  publicTag: z.string().min(1).max(32),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(z.enum(TOPIC_SEARCH_SOURCES)).min(1)
});

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: { slug: string } }) {
  try {
    const body = bodySchema.parse(await request.json());
    if (body.dateFrom > body.dateTo) throw new Error("dateFrom must be before or equal to dateTo.");
    const profile = createTopicProfileRepository().saveMetadata(context.params.slug, body);
    return NextResponse.json({ profile });
  } catch (error) {
    return handleRouteError(error);
  }
}
