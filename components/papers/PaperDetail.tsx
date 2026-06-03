"use client";

import Link from "next/link";
import { ExternalLink, FileText, Github, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FavoriteButton } from "@/components/papers/FavoriteButton";
import { KeywordTags } from "@/components/papers/KeywordTags";
import { PaperUserNote } from "@/components/papers/PaperUserNote";
import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import { StatusSelect } from "@/components/ui/StatusSelect";
import type { Paper, PaperStatus } from "@/lib/papers/types";

export function PaperDetail({ id }: { id: string }) {
  const { trackSync } = useSyncStatus();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalyzingPdf, setIsAnalyzingPdf] = useState(false);
  const mutationSequences = useRef(new Map<string, number>());

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/papers/${id}`);
      if (!response.ok) {
        setError("论文不存在或加载失败");
        setIsLoading(false);
        return;
      }
      const data = (await response.json()) as { paper: Paper };
      setPaper(data.paper);
      setIsLoading(false);
    }
    void load();
  }, [id]);

  async function patchFavorite() {
    if (!paper) return;
    const previousFavorite = paper.isFavorite;
    const nextFavorite = !paper.isFavorite;
    const mutationKey = `${paper.id}:favorite`;
    const sequence = nextMutationSequence(mutationKey);
    setPaper({ ...paper, isFavorite: nextFavorite });
    let response: Response;
    try {
      response = await trackSync(fetch(`/api/papers/${paper.id}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: nextFavorite })
      }).then(throwIfNotOk));
    } catch {
      if (isLatestMutation(mutationKey, sequence)) {
        setPaper((current) => (current ? { ...current, isFavorite: previousFavorite } : current));
      }
      return setError("收藏状态保存失败");
    }
    if (!response.ok) {
      if (isLatestMutation(mutationKey, sequence)) {
        setPaper((current) => (current ? { ...current, isFavorite: previousFavorite } : current));
      }
      return setError("收藏状态保存失败");
    }
    const data = (await response.json()) as { paper: Paper };
    if (!isLatestMutation(mutationKey, sequence)) return;
    setPaper((current) => (current ? { ...current, isFavorite: data.paper.isFavorite } : data.paper));
  }

  async function patchStatus(status: PaperStatus) {
    if (!paper) return;
    const previousStatus = paper.status;
    const mutationKey = `${paper.id}:status`;
    const sequence = nextMutationSequence(mutationKey);
    setPaper({ ...paper, status });
    let response: Response;
    try {
      response = await trackSync(fetch(`/api/papers/${paper.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      }).then(throwIfNotOk));
    } catch {
      if (isLatestMutation(mutationKey, sequence)) {
        setPaper((current) => (current ? { ...current, status: previousStatus } : current));
      }
      return setError("阅读状态保存失败");
    }
    if (!response.ok) {
      if (isLatestMutation(mutationKey, sequence)) {
        setPaper((current) => (current ? { ...current, status: previousStatus } : current));
      }
      return setError("阅读状态保存失败");
    }
    const data = (await response.json()) as { paper: Paper };
    if (!isLatestMutation(mutationKey, sequence)) return;
    setPaper((current) => (current ? { ...current, status: data.paper.status } : data.paper));
  }

  function nextMutationSequence(mutationKey: string): number {
    const next = (mutationSequences.current.get(mutationKey) ?? 0) + 1;
    mutationSequences.current.set(mutationKey, next);
    return next;
  }

  function isLatestMutation(mutationKey: string, sequence: number): boolean {
    return mutationSequences.current.get(mutationKey) === sequence;
  }

  async function generatePdfAnalysis() {
    if (!paper) return;
    setError(null);
    setIsAnalyzingPdf(true);
    try {
      const response = await fetch(`/api/papers/${paper.id}/pdf-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        return setError(data?.error ?? "PDF 精读解析失败");
      }
      const data = (await response.json()) as { paper: Paper };
      setPaper(data.paper);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "PDF 精读解析失败");
    } finally {
      setIsAnalyzingPdf(false);
    }
  }

  if (isLoading) return <div className="rounded-md border border-line bg-surface p-6 text-sm text-muted">正在加载论文...</div>;
  if (!paper) return <div className="rounded-md border border-danger/30 bg-danger/10 p-6 text-sm text-danger">{error}</div>;

  return (
    <article className="rounded-md border border-line bg-surface p-5">
      <Link href="/papers" className="text-sm text-muted hover:text-accent">
        返回论文库
      </Link>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span>{new Date(paper.publishedAt).toLocaleDateString("zh-CN")}</span>
            <span>{paper.categories.join(", ")}</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold leading-8">{paper.title}</h2>
          <p className="mt-3 text-sm text-muted">{paper.authors.join(", ")}</p>
          <p className="mt-2 text-sm text-muted">完成单位：{paper.pdfAnalysisAffiliations ?? "PDF 精读解析后显示"}</p>
          <div className="mt-3">
            <KeywordTags tags={paper.keywordTags} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <StatusSelect value={paper.status} onChange={(next) => void patchStatus(next)} />
          <FavoriteButton isFavorite={paper.isFavorite} onClick={() => void patchFavorite()} />
        </div>
      </div>
      <div className="mt-5 max-w-4xl">
        <PaperUserNote key={paper.id} paper={paper} onPaperChange={setPaper} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-line bg-background p-4">
        <button
          type="button"
          disabled={isAnalyzingPdf}
          onClick={() => void generatePdfAnalysis()}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-surface disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${isAnalyzingPdf ? "animate-spin" : ""}`} />
          {paper.pdfAnalysisOverviewZh ? "刷新 PDF 精读解析" : "生成 PDF 精读解析"}
        </button>
        <span className="text-xs leading-5 text-muted">
          {isAnalyzingPdf
            ? "正在下载 PDF、抽取正文并调用大模型，长论文可能需要几分钟。"
            : paper.pdfAnalysisCheckedAt
              ? `上次解析：${new Date(paper.pdfAnalysisCheckedAt).toLocaleString("zh-CN")}`
              : "详情页使用 PDF 正文解析；抓取未生成或需要重跑时可手动触发。"}
        </span>
        {error ? <span className="w-full rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</span> : null}
      </div>
      {paper.pdfAnalysisOverviewZh ? (
        <div className="mt-6 max-w-4xl space-y-5">
          <section className="rounded-md border border-line bg-background p-4">
            <h3 className="text-sm font-semibold">中文导读</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-primary/90">{paper.pdfAnalysisOverviewZh}</p>
          </section>
          <section className="grid gap-4 md:grid-cols-2">
            <PdfAnalysisSection title="背景与脉络" content={paper.pdfAnalysisBackgroundZh} />
            <PdfAnalysisSection title="问题定义" content={paper.pdfAnalysisProblemFormulationZh} />
          </section>
          <PdfAnalysisSection title="方法流程" content={paper.pdfAnalysisMethodZh} />
          <PdfAnalysisSection title="关键思想" content={paper.pdfAnalysisKeyIdeasZh} />
          <PdfAnalysisSection title="实验与证据" content={paper.pdfAnalysisExperimentsZh} />
          <PdfAnalysisSection title="局限与风险" content={paper.pdfAnalysisLimitationsZh} />
          <PdfAnalysisSection title="精读建议" content={paper.pdfAnalysisReadingGuideZh} />
        </div>
      ) : paper.analysisSummaryZh ? (
        <div className="mt-6 max-w-4xl space-y-5">
          <div className="rounded-md border border-accent/30 bg-accent/10 p-4 text-sm leading-6 text-primary/80">
            当前展示的是摘要级解析。抓取后通常会自动生成 PDF 精读解析；也可以点击“生成 PDF 精读解析”立即补生成。
          </div>
          <section className="rounded-md border border-line bg-background p-4">
            <h3 className="text-sm font-semibold">一句话概括</h3>
            <p className="mt-2 text-sm leading-7 text-primary/90">{paper.analysisSummaryZh}</p>
          </section>
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-line bg-background p-4">
              <h3 className="text-sm font-semibold">解决什么问题</h3>
              <p className="mt-2 text-sm leading-7 text-primary/90">{paper.analysisProblemZh}</p>
            </div>
            <div className="rounded-md border border-line bg-background p-4">
              <h3 className="text-sm font-semibold">核心方法</h3>
              <p className="mt-2 text-sm leading-7 text-primary/90">{paper.analysisMethodZh}</p>
            </div>
          </section>
          <section className="rounded-md border border-line bg-background p-4">
            <h3 className="text-sm font-semibold">主要贡献</h3>
            <p className="mt-2 text-sm leading-7 text-primary/90">{paper.analysisContributionZh}</p>
          </section>
          <section className="rounded-md border border-line bg-background p-4">
            <h3 className="text-sm font-semibold">详细理解</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-primary/90">{paper.analysisDetailZh}</p>
          </section>
        </div>
      ) : (
        <div className="mt-6 rounded-md border border-line bg-background p-4 text-sm text-muted">
          这篇论文还没有中文解析。新抓取的匹配论文会自动生成摘要级中文解析和 PDF 精读解析，也可以先手动生成 PDF 精读解析。
        </div>
      )}
      <section className="mt-6 max-w-4xl rounded-md border border-line bg-background p-4">
        <h3 className="text-sm font-semibold">原始摘要</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-primary/90">{paper.abstract}</p>
      </section>
      <div className="mt-6 flex flex-wrap gap-2">
        <a href={paper.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-surface">
          <ExternalLink className="h-4 w-4" />
          arXiv 页面
        </a>
        <a href={paper.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted hover:border-accent hover:text-accent">
          <FileText className="h-4 w-4" />
          PDF
        </a>
        {paper.githubUrls.map((url) => (
          <a href={url} key={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted hover:border-accent hover:text-accent">
            <Github className="h-4 w-4" />
            GitHub
          </a>
        ))}
      </div>
    </article>
  );
}

function PdfAnalysisSection({ title, content }: { title: string; content: string | null }) {
  return (
    <section className="rounded-md border border-line bg-background p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-primary/90">{content ?? "未识别"}</p>
    </section>
  );
}

async function throwIfNotOk(response: Response): Promise<Response> {
  if (!response.ok) throw new Error("Paper update failed.");
  return response;
}
