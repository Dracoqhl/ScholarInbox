"use client";

import Link from "next/link";
import { ExternalLink, FileText, Github } from "lucide-react";
import { useEffect, useState } from "react";

import { FavoriteButton } from "@/components/papers/FavoriteButton";
import { StatusSelect } from "@/components/ui/StatusSelect";
import type { Paper, PaperStatus } from "@/lib/papers/types";

export function PaperDetail({ id }: { id: string }) {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
    setIsSaving(true);
    const response = await fetch(`/api/papers/${paper.id}/favorite`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !paper.isFavorite })
    });
    setIsSaving(false);
    if (!response.ok) return setError("收藏状态保存失败");
    const data = (await response.json()) as { paper: Paper };
    setPaper(data.paper);
  }

  async function patchStatus(status: PaperStatus) {
    if (!paper) return;
    setIsSaving(true);
    const response = await fetch(`/api/papers/${paper.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    setIsSaving(false);
    if (!response.ok) return setError("阅读状态保存失败");
    const data = (await response.json()) as { paper: Paper };
    setPaper(data.paper);
  }

  if (isLoading) return <div className="rounded-md border border-line bg-surface p-6 text-sm text-muted">正在加载论文...</div>;
  if (error || !paper) return <div className="rounded-md border border-danger/30 bg-danger/10 p-6 text-sm text-danger">{error}</div>;

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
        </div>
        <div className="flex shrink-0 gap-2">
          <StatusSelect value={paper.status} disabled={isSaving} onChange={(next) => void patchStatus(next)} />
          <FavoriteButton isFavorite={paper.isFavorite} disabled={isSaving} onClick={() => void patchFavorite()} />
        </div>
      </div>
      {paper.analysisSummaryZh ? (
        <div className="mt-6 max-w-4xl space-y-5">
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
          这篇论文还没有中文解析。当前测试阶段只会在每轮抓取后解析 1 篇匹配论文。
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
