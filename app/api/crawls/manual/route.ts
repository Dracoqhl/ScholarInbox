import { z } from "zod";

import { crawlArxivDateRange } from "@/lib/crawls/crawler";
import { createCrawlRepository } from "@/lib/crawls/repository";
import { getAppDatabase } from "@/lib/db/app-database";
import { createSettingsRepository } from "@/lib/settings/repository";
import { handleRouteError } from "@/lib/validation/http";

const bodySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categories: z.array(z.string().min(1)).optional(),
  maxResults: z.number().int().min(1).max(500).optional(),
  trigger: z.enum(["manual", "scheduled"]).optional()
});

export const dynamic = "force-dynamic";
const STALE_RUNNING_CRAWL_MS = 30 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const db = getAppDatabase();
    await createCrawlRepository(db).failStaleRunningRuns({ olderThanMs: STALE_RUNNING_CRAWL_MS });
    const settings = await createSettingsRepository(db).get();
    const encoder = new TextEncoder();
    const categories = body.categories?.length ? body.categories : settings.categories;
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
                message: `Accepted ${body.trigger ?? "manual"} crawl request.`,
                stage: "submitted",
                progress: { current: 0, total: 7, label: "请求已提交" },
                details: {
                  categories,
                  dateFrom: body.dateFrom,
                  dateTo: body.dateTo,
                  maxResults: body.maxResults,
                  trigger: body.trigger ?? "manual"
                }
              }
            });
            const run = await crawlArxivDateRange({
              db,
              categories,
              dateFrom: body.dateFrom,
              dateTo: body.dateTo,
              maxResults: body.maxResults,
              trigger: body.trigger,
              onLog: (log) => send({ type: "log", log })
            });
            send({ type: "run", run });
          } catch (error) {
            send({
              type: "error",
              error: error instanceof Error ? error.message : "Unexpected server error"
            });
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
