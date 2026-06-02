import { analyzePdfTextWithLlm } from "@/lib/pdf-analysis/llm-pdf-analysis";
import { extractPdfTextFromPaperPdf } from "@/lib/pdf-analysis/pdf-text";
import type { createPaperRepository } from "@/lib/papers/repository";
import type { Paper, PaperPdfAnalysisResult } from "@/lib/papers/types";

export type PdfAnalysisServiceInput = {
  paperRepository: ReturnType<typeof createPaperRepository>;
  paper: Paper;
  extractPdfText?: (paper: Paper) => Promise<string>;
  analyzePdfText?: (paper: Paper, pdfText: string) => Promise<PaperPdfAnalysisResult>;
};

export async function generateAndStorePdfAnalysis(input: PdfAnalysisServiceInput): Promise<Paper> {
  const extractPdfText = input.extractPdfText ?? extractPdfTextFromPaperPdf;
  const analyzePdfText = input.analyzePdfText ?? analyzePdfTextWithLlm;
  const pdfText = await extractPdfText(input.paper);
  const analysis = await analyzePdfText(input.paper, pdfText);
  const updated = await input.paperRepository.setPdfAnalysisResult(input.paper.id, analysis);

  if (!updated) {
    throw new Error("Paper not found while storing PDF analysis.");
  }

  return updated;
}
