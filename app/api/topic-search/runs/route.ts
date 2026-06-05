import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAppDatabase } from "@/lib/db/app-database";
import { createTopicProfileRepository } from "@/lib/topic-search/profile-repository";
import { TOPIC_SEARCH_SOURCES } from "@/lib/topic-search/profile";
import { createTopicSearchRepository } from "@/lib/topic-search/repository";
import { runTopicSearch } from "@/lib/topic-search/service";
import { handleRouteError } from "@/lib/validation/http";

const bodySchema = z.object({
  profileSlug: z.string().min(1),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(z.enum(TOPIC_SEARCH_SOURCES)).min(1),
  maxResults: z.number().int().min(1).max(500).optional()
});

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const repository = createTopicSearchRepository(getAppDatabase());
    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const runs = await repository.listRuns(limit ? { limit } : undefined);
    return NextResponse.json({ runs });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    if (body.dateFrom > body.dateTo) throw new Error("dateFrom must be before or equal to dateTo.");
    const profile = createTopicProfileRepository().get(body.profileSlug);
    if (!profile) throw new Error(`Topic profile not found: ${body.profileSlug}`);
    const db = getAppDatabase();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        let isClosed = false;
        const send = (event: unknown) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            isClosed = true;
          }
        };
        const heartbeat = setInterval(() => {
          send({ type: "heartbeat", at: new Date().toISOString() });
        }, 15_000);

        void (async () => {
          try {
            send({
              type: "log",
              log: {
                at: new Date().toISOString(),
                level: "info",
                stage: "submitted",
                message: "Accepted topic search request.",
                details: {
                  profileSlug: body.profileSlug,
                  sources: body.sources,
                  dateFrom: body.dateFrom,
                  dateTo: body.dateTo,
                  maxResults: body.maxResults
                }
              }
            });
            const run = await runTopicSearch({
              db,
              profile,
              dateFrom: body.dateFrom,
              dateTo: body.dateTo,
              sources: body.sources,
              maxResults: body.maxResults
            });
            send({ type: "run", run });
          } catch (error) {
            send({ type: "error", error: error instanceof Error ? error.message : "Unexpected server error" });
          } finally {
            clearInterval(heartbeat);
            if (!isClosed) {
              try {
                controller.close();
              } catch {
                isClosed = true;
              }
            }
          }
        })();
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
