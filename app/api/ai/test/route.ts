import { NextResponse } from "next/server";

import { getAiConnectionConfigFromEnv, testAiConnection } from "@/lib/ai/client";
import { handleRouteError } from "@/lib/validation/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await testAiConnection(getAiConnectionConfigFromEnv());
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return handleRouteError(error);
  }
}
