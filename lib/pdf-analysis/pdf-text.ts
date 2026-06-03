import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import type { Paper } from "@/lib/papers/types";

const PDF_FETCH_TIMEOUT_MS = 120_000;
const PDF_TEXT_MAX_BUFFER = 24 * 1024 * 1024;

export async function extractPdfTextFromPaperPdf(paper: Paper, fetcher: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);
  const pdfPath = join(tmpdir(), `scholar-inbox-${paper.id}-${randomUUID()}.pdf`);

  try {
    const response = await fetcher(paper.pdfUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ScholarInbox/1.0 (PDF text extraction for personal research reading)"
      }
    });

    if (!response.ok) {
      throw new Error(`PDF download failed with ${response.status}.`);
    }

    writeFileSync(pdfPath, Buffer.from(await response.arrayBuffer()));
    const text = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, "-"], {
      encoding: "utf8",
      maxBuffer: PDF_TEXT_MAX_BUFFER
    });

    const normalized = normalizePdfText(text);
    if (!normalized) {
      throw new Error("PDF text extraction returned empty text.");
    }
    return normalized;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("PDF download timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    rmSync(pdfPath, { force: true });
  }
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
