"use client";

import Link from "next/link";
import { ExternalLink, FileText, Github, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FavoriteButton } from "@/components/papers/FavoriteButton";
import { StatusSelect } from "@/components/ui/StatusSelect";
import type { Paper, PaperStatus } from "@/lib/papers/types";

export function PaperList({ favoriteOnly = false }: { favoriteOnly?: boolean }) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PaperStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isDeletingNew, setIsDeletingNew] = useState(false);

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (favoriteOnly) params.set("favorite", "true");
    if (query.trim()) params.set("query", query.trim());
    if (status !== "all") params.set("status", status);
    return `/api/papers${params.toString() ? `?${params}` : ""}`;
  }, [favoriteOnly, query, status]);

  const loadPapers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await fetch(endpoint);
    if (!response.ok) {
      setError("论文列表加载失败");
      setIsLoading(false);
      return;
    }
    const data = (await response.json()) as { papers: Paper[] };
    setPapers(data.papers);
    setIsLoading(false);
  }, [endpoint]);

  useEffect(() => {
    void loadPapers();
  }, [loadPapers]);

  async function updateFavorite(paper: Paper) {
    setPendingId(paper.id);
    const response = await fetch(`/api/papers/${paper.id}/favorite`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !paper.isFavorite })
    });
    setPendingId(null);
    if (!response.ok) {
      setError("收藏状态保存失败");
      return;
    }
    const data = (await response.json()) as { paper: Paper };
    setPapers((current) =>
      favoriteOnly && !data.paper.isFavorite
        ? current.filter((item) => item.id !== paper.id)
        : current.map((item) => (item.id === paper.id ? data.paper : item))
    );
  }

  async function updateStatus(paper: Paper, nextStatus: PaperStatus) {
    setPendingId(paper.id);
    const response = await fetch(`/api/papers/${paper.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    setPendingId(null);
    if (!response.ok) {
      setError("阅读状态保存失败");
      return;
    }
    const data = (await response.json()) as { paper: Paper };
    setPapers((current) => current.map((item) => (item.id === paper.id ? data.paper : item)));
  }

  async function deleteNewMatchedPapers() {
    setIsDeletingNew(true);
    setError(null);
    const response = await fetch("/api/papers?status=new&matched=true", { method: "DELETE" });
    setIsDeletingNew(false);
    if (!response.ok) {
      setError("删除新论文失败");
      return;
    }
    await loadPapers();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{favoriteOnly ? "收藏论文" : "论文库"}</h2>
          <p className="mt-1 text-sm text-muted">
            {favoriteOnly ? "回顾你标记过的高价值工作。" : "扫描匹配兴趣方向的论文，更新状态并收藏值得回看的工作。"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!favoriteOnly ? (
            <button
              type="button"
              disabled={isDeletingNew}
              onClick={() => void deleteNewMatchedPapers()}
              className="h-10 rounded-md border border-danger/40 px-3 text-sm font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeletingNew ? "删除中..." : "删除新论文"}
            </button>
          ) : null}
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题或摘要"
              className="h-10 w-full rounded-md border border-line bg-background pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 sm:w-64"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as PaperStatus | "all")}
            className="h-10 rounded-md border border-line bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            aria-label="状态过滤"
          >
            <option value="all">全部状态</option>
            <option value="new">新论文</option>
            <option value="general">一般</option>
            <option value="interested">感兴趣</option>
            <option value="reading">阅读中</option>
            <option value="done">已读</option>
            <option value="archived">归档</option>
            <option value="irrelevant">方向无关</option>
          </select>
        </div>
      </div>

      {error ? <p className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      {isLoading ? (
        <div className="rounded-md border border-line bg-surface p-6 text-sm text-muted">正在加载论文...</div>
      ) : papers.length === 0 ? (
        <div className="rounded-md border border-line bg-surface p-6">
          <h3 className="font-medium">还没有可显示的论文</h3>
          <p className="mt-2 text-sm text-muted">先确认 AI 配置可用，再到抓取页面运行一次 arXiv 抓取。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {papers.map((paper) => (
            <article key={paper.id} className="rounded-md border border-line bg-surface p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    <span>{formatDate(paper.publishedAt)}</span>
                    <span>{paper.primaryCategory}</span>
                    <span>{paper.categories.join(", ")}</span>
                  </div>
                  <Link href={`/papers/${paper.id}`} className="mt-2 block text-base font-semibold leading-6 hover:text-accent">
                    {paper.title}
                  </Link>
                  <p className="mt-2 text-sm text-muted">{paper.authors.join(", ")}</p>
                  {paper.analysisSummaryZh ? (
                    <div className="mt-3 space-y-2 text-sm leading-6 text-primary/90">
                      <p className="font-medium">{paper.analysisSummaryZh}</p>
                      <p>
                        <span className="text-muted">解决问题：</span>
                        {paper.analysisProblemZh}
                      </p>
                      <p>
                        <span className="text-muted">核心方法：</span>
                        {paper.analysisMethodZh}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 line-clamp-3 text-sm leading-6 text-primary/85">{paper.abstract}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <StatusSelect value={paper.status} disabled={pendingId === paper.id} onChange={(next) => void updateStatus(paper, next)} />
                  <FavoriteButton isFavorite={paper.isFavorite} disabled={pendingId === paper.id} onClick={() => void updateFavorite(paper)} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={paper.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
                >
                  <ExternalLink className="h-4 w-4" />
                  arXiv
                </a>
                <a
                  href={paper.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
                >
                  <FileText className="h-4 w-4" />
                  PDF
                </a>
                {paper.githubUrls.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
                  >
                    <Github className="h-4 w-4" />
                    GitHub
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
