import { NextResponse } from "next/server";

import { createTopicProfileRepository } from "@/lib/topic-search/profile-repository";
import { handleRouteError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = createTopicProfileRepository().list();
    return NextResponse.json({ profiles });
  } catch (error) {
    return handleRouteError(error);
  }
}
