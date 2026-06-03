"use client";

import Link from "next/link";
import { ExternalLink, FileText, Github, MessageSquare, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FavoriteButton } from "@/components/papers/FavoriteButton";
import { KeywordTags } from "@/components/papers/KeywordTags";
import { PaperUserNote } from "@/components/papers/PaperUserNote";
import { UserTagPicker } from "@/components/papers/UserTagPicker";
import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import { StatusSelect, type PaperStatusAction } from "@/components/ui/StatusSelect";
import { groupPapersByPublishedDate, shouldKeepPaperAfterLocalMutation, sortPapersForList, type PaperListMode, type PaperSortMode } from "@/lib/papers/list-view";
import type { Paper, PaperStatus, UserTag } from "@/lib/papers/types";

export function PaperList({ mode = "inbox", favoriteOnly = false }: { mode?: PaperListMode; favoriteOnly?: boolean }) {
  const { trackSync } = useSyncStatus();
  const listMode = favoriteOnly ? "favorites" : mode;
  const [papers, setPapers] = useState<Paper[]>([]);
  const [userTags, setUserTags] = useState<UserTag[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<PaperStatus | "all">(listMode === "archive" ? "archived" : listMode === "inbox" ? "new" : "all");
  const [selectedUserTagIds, setSelectedUserTagIds] = useState<string[]>([]);
  const [keywordTagQuery, setKeywordTagQuery] = useState("");
  const [publishedFrom, setPublishedFrom] = useState("");
  const [publishedTo, setPublishedTo] = useState("");
  const [sortMode, setSortMode] = useState<PaperSortMode>("date");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeletingNew, setIsDeletingNew] = useState(false);
  const mutationSequences = useRef(new Map<string, number>());

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (listMode === "favorites") params.set("favorite", "true");
    if (query.trim()) params.set("query", query.trim());
    if (status !== "all") params.set("status", status);
    for (const tagId of selectedUserTagIds) params.append("userTagId", tagId);
    for (const tag of parseKeywordTagQuery(keywordTagQuery)) params.append("keywordTag", tag);
    if (publishedFrom.trim()) params.set("publishedFrom", publishedFrom.trim());
    if (publishedTo.trim()) params.set("publishedTo", publishedTo.trim());
    return `/api/papers${params.toString() ? `?${params}` : ""}`;
  }, [keywordTagQuery, listMode, publishedFrom, publishedTo, query, selectedUserTagIds, status]);

  const sortedPapers = useMemo(() => sortPapersForList(papers, sortMode), [papers, sortMode]);
  const dateGroups = useMemo(() => groupPapersByPublishedDate(sortedPapers), [sortedPapers]);

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

  useEffect(() => {
    async function loadUserTags() {
      const response = await fetch("/api/user-tags");
      if (!response.ok) return;
      const data = (await response.json()) as { tags: UserTag[] };
      setUserTags(data.tags);
    }
    void loadUserTags();
  }, []);

  async function updateFavorite(paper: Paper, nextFavorite = !paper.isFavorite) {
    const previousFavorite = paper.isFavorite;
    const previousStatus = paper.status;
    const mutationKey = `${paper.id}:favorite`;
    const sequence = nextMutationSequence(mutationKey);
    setPapers((current) => current.map((item) => (item.id === paper.id ? { ...item, isFavorite: nextFavorite, status: nextFavorite ? "archived" : item.status } : item)));
    let response: Response;
    try {
      response = await trackSync(fetch(`/api/papers/${paper.id}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: nextFavorite })
      }).then(throwIfNotOk));
    } catch {
      if (isLatestMutation(mutationKey, sequence)) {
        setPapers((current) => current.map((item) => (item.id === paper.id ? { ...item, isFavorite: previousFavorite, status: previousStatus } : item)));
      }
      setError("收藏状态保存失败");
      return;
    }
    if (!response.ok) {
      if (isLatestMutation(mutationKey, sequence)) {
        setPapers((current) => current.map((item) => (item.id === paper.id ? { ...item, isFavorite: previousFavorite, status: previousStatus } : item)));
      }
      setError("收藏状态保存失败");
      return;
    }
    const data = (await response.json()) as { paper: Paper };
    if (!isLatestMutation(mutationKey, sequence)) return;
    const visibilityFilters = getCurrentVisibilityFilters();
    setPapers((current) =>
      !shouldKeepPaperAfterLocalMutation(data.paper, visibilityFilters)
        ? current.filter((item) => item.id !== paper.id)
        : listMode === "favorites" && !data.paper.isFavorite
        ? current.filter((item) => item.id !== paper.id)
        : current.map((item) => (item.id === paper.id ? { ...item, ...data.paper } : item))
    );
  }

  async function updateStatus(paper: Paper, nextStatus: PaperStatus) {
    const previousStatus = paper.status;
    const previousFavorite = paper.isFavorite;
    const mutationKey = `${paper.id}:status`;
    const sequence = nextMutationSequence(mutationKey);
    setPapers((current) =>
      current.map((item) => (item.id === paper.id ? { ...item, status: nextStatus, isFavorite: nextStatus === "irrelevant" || nextStatus === "skipped" ? false : item.isFavorite } : item))
    );
    let response: Response;
    try {
      response = await trackSync(fetch(`/api/papers/${paper.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      }).then(throwIfNotOk));
    } catch {
      if (isLatestMutation(mutationKey, sequence)) {
        setPapers((current) => current.map((item) => (item.id === paper.id ? { ...item, status: previousStatus, isFavorite: previousFavorite } : item)));
      }
      setError("阅读状态保存失败");
      return;
    }
    if (!response.ok) {
      if (isLatestMutation(mutationKey, sequence)) {
        setPapers((current) => current.map((item) => (item.id === paper.id ? { ...item, status: previousStatus, isFavorite: previousFavorite } : item)));
      }
      setError("阅读状态保存失败");
      return;
    }
    const data = (await response.json()) as { paper: Paper };
    if (!isLatestMutation(mutationKey, sequence)) return;
    const visibilityFilters = getCurrentVisibilityFilters();
    setPapers((current) =>
      shouldKeepPaperAfterLocalMutation(data.paper, visibilityFilters)
        ? current.map((item) => (item.id === paper.id ? { ...item, ...data.paper } : item))
        : current.filter((item) => item.id !== paper.id)
    );
  }

  async function updateStatusAction(paper: Paper, action: PaperStatusAction) {
    if (action === "favorite") {
      await updateFavorite(paper, true);
      return;
    }
    await updateStatus(paper, action);
  }

  function updatePaperLocally(nextPaper: Paper) {
    setPapers((current) => current.map((item) => (item.id === nextPaper.id ? { ...item, ...nextPaper } : item)));
  }

  async function createUserTag(input: { name: string; color: string }): Promise<UserTag> {
    const response = await trackSync(fetch("/api/user-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }).then(throwIfNotOk));
    const data = (await response.json()) as { tag: UserTag };
    setUserTags((current) => (current.some((tag) => tag.id === data.tag.id) ? current : [...current, data.tag]));
    return data.tag;
  }

  async function updateUserTags(paperId: string, tags: UserTag[]) {
    const previous = papers.find((paper) => paper.id === paperId)?.userTags ?? [];
    const mutationKey = `${paperId}:user-tags`;
    const sequence = nextMutationSequence(mutationKey);
    setPapers((current) => current.map((paper) => (paper.id === paperId ? { ...paper, userTags: tags } : paper)));
    try {
      const response = await trackSync(fetch(`/api/papers/${paperId}/user-tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: tags.map((tag) => tag.id) })
      }).then(throwIfNotOk));
      const data = (await response.json()) as { paper: Paper };
      if (!isLatestMutation(mutationKey, sequence)) return;
      setPapers((current) => current.map((paper) => (paper.id === paperId ? { ...paper, ...data.paper } : paper)));
    } catch {
      if (isLatestMutation(mutationKey, sequence)) {
        setPapers((current) => current.map((paper) => (paper.id === paperId ? { ...paper, userTags: previous } : paper)));
      }
      setError("自定义标签保存失败");
    }
  }

  function nextMutationSequence(mutationKey: string): number {
    const next = (mutationSequences.current.get(mutationKey) ?? 0) + 1;
    mutationSequences.current.set(mutationKey, next);
    return next;
  }

  function isLatestMutation(mutationKey: string, sequence: number): boolean {
    return mutationSequences.current.get(mutationKey) === sequence;
  }

  function getCurrentVisibilityFilters() {
    return {
      mode: listMode,
      status,
      selectedUserTagIds,
      keywordTags: parseKeywordTagQuery(keywordTagQuery),
      publishedFrom,
      publishedTo
    };
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
          <h2 className="text-lg font-semibold">{listMode === "favorites" ? "收藏论文" : listMode === "archive" ? "归档论文" : "新论文"}</h2>
          <p className="mt-1 text-sm text-muted">
            {listMode === "favorites"
              ? "回顾你标记过的高价值工作。"
              : listMode === "archive"
                ? "整理已经归档的论文，用自定义标签沉淀个人知识库。"
                : "扫描新论文，归档方向一致的工作，收藏值得精读的论文。"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {listMode === "inbox" ? (
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
            <option value="skipped">略过</option>
            <option value="archived">归档</option>
            <option value="irrelevant">方向无关</option>
          </select>
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as PaperSortMode)}
            className="h-10 rounded-md border border-line bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            aria-label="排序方式"
          >
            <option value="date">按日期</option>
            <option value="score">按相关分数</option>
          </select>
        </div>
      </div>

      {listMode === "archive" ? (
        <div className="grid gap-3 rounded-md border border-line bg-surface p-4 md:grid-cols-4">
          <label className="space-y-1 text-xs font-medium text-muted">
            自定义标签
            <select
              value=""
              onChange={(event) => {
                const tagId = event.target.value;
                if (tagId && !selectedUserTagIds.includes(tagId)) setSelectedUserTagIds((current) => [...current, tagId]);
                event.currentTarget.value = "";
              }}
              className="h-10 w-full rounded-md border border-line bg-background px-3 text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            >
              <option value="">添加筛选标签</option>
              {userTags
                .filter((tag) => !selectedUserTagIds.includes(tag.id))
                .map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-muted">
            AI 关键词
            <input
              value={keywordTagQuery}
              onChange={(event) => setKeywordTagQuery(event.target.value)}
              placeholder="GRPO, RLHF"
              className="h-10 w-full rounded-md border border-line bg-background px-3 text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted">
            开始日期
            <input
              type="date"
              value={publishedFrom}
              onChange={(event) => setPublishedFrom(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-background px-3 text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted">
            结束日期
            <input
              type="date"
              value={publishedTo}
              onChange={(event) => setPublishedTo(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-background px-3 text-sm text-primary outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>
          {selectedUserTagIds.length ? (
            <div className="flex flex-wrap gap-2 md:col-span-4">
              {selectedUserTagIds.map((tagId) => {
                const tag = userTags.find((item) => item.id === tagId);
                if (!tag) return null;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSelectedUserTagIds((current) => current.filter((item) => item !== tag.id))}
                    className="rounded-md px-2 py-1 text-xs font-medium"
                    style={{ backgroundColor: `${tag.color}1a`, color: tag.color, border: `1px solid ${tag.color}55` }}
                  >
                    {tag.name} ×
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p> : null}

      {isLoading ? (
        <div className="rounded-md border border-line bg-surface p-6 text-sm text-muted">正在加载论文...</div>
      ) : sortedPapers.length === 0 ? (
        <div className="rounded-md border border-line bg-surface p-6">
          <h3 className="font-medium">还没有可显示的论文</h3>
          <p className="mt-2 text-sm text-muted">先确认 AI 配置可用，再到抓取页面运行一次 arXiv 抓取。</p>
        </div>
      ) : sortMode === "date" ? (
        <div className="space-y-6">
          {dateGroups.map((group) => (
            <section key={group.date} className="space-y-3">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/95 py-2 backdrop-blur">
                <h3 className="text-sm font-semibold text-primary">{formatDate(group.date)}</h3>
                <span className="text-xs text-muted">{group.papers.length} 篇</span>
              </div>
              <div className="space-y-3">
                {group.papers.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    updateStatusAction={updateStatusAction}
                    updateFavorite={updateFavorite}
                    updatePaperLocally={updatePaperLocally}
                    userTags={userTags}
                    createUserTag={createUserTag}
                    updateUserTags={updateUserTags}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {sortedPapers.map((paper) => (
            <PaperCard
              key={paper.id}
              paper={paper}
              updateStatusAction={updateStatusAction}
              updateFavorite={updateFavorite}
              updatePaperLocally={updatePaperLocally}
              userTags={userTags}
              createUserTag={createUserTag}
              updateUserTags={updateUserTags}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function PaperCard({
  paper,
  updateStatusAction,
  updateFavorite,
  updatePaperLocally,
  userTags,
  createUserTag,
  updateUserTags
}: {
  paper: Paper;
  updateStatusAction: (paper: Paper, action: PaperStatusAction) => Promise<void>;
  updateFavorite: (paper: Paper, nextFavorite?: boolean) => Promise<void>;
  updatePaperLocally: (paper: Paper) => void;
  userTags: UserTag[];
  createUserTag: (input: { name: string; color: string }) => Promise<UserTag>;
  updateUserTags: (paperId: string, tags: UserTag[]) => Promise<void>;
}) {
  const [isNoteOpen, setIsNoteOpen] = useState(Boolean(paper.userNote.trim()));

  return (
    <article className="rounded-md border border-line bg-surface p-4 shadow-[0_1px_0_oklch(var(--line))]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{formatDate(paper.publishedAt)}</span>
            <span>{paper.primaryCategory}</span>
            <span>{paper.categories.join(", ")}</span>
            <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 font-medium text-accent">
              相关分数 {formatScore(paper.filterScore)}
            </span>
          </div>
          <Link href={`/papers/${paper.id}`} className="mt-2 block text-base font-semibold leading-6 hover:text-accent">
            {paper.title}
          </Link>
          <div className="mt-2">
            <KeywordTags tags={paper.keywordTags} />
          </div>
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
          <StatusSelect value={paper.isFavorite ? "favorite" : paper.status} onChange={(next) => void updateStatusAction(paper, next)} />
          <FavoriteButton isFavorite={paper.isFavorite} onClick={() => void updateFavorite(paper)} />
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={paper.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium text-muted hover:border-accent hover:text-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            arXiv
          </a>
          <a
            href={paper.pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium text-muted hover:border-accent hover:text-accent"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </a>
          {paper.githubUrls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-medium text-muted hover:border-accent hover:text-accent"
            >
              <Github className="h-3.5 w-3.5" />
              GitHub
            </a>
          ))}
          <button
            type="button"
            onClick={() => setIsNoteOpen((current) => !current)}
            className={[
              "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-accent/30",
              paper.userNote.trim()
                ? "border-accent/40 bg-accent/10 text-accent hover:border-accent"
                : "border-line text-muted hover:border-accent hover:text-accent"
            ].join(" ")}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {paper.userNote.trim() ? "编辑评论" : "评论"}
          </button>
        </div>
        <div className="min-w-0 lg:max-w-[52%]">
          <UserTagPicker
            paperId={paper.id}
            selectedTags={paper.userTags}
            availableTags={userTags}
            onCreateTag={createUserTag}
            onChange={updateUserTags}
          />
        </div>
      </div>
      {isNoteOpen ? (
        <div className="mt-3">
          <PaperUserNote key={paper.id} paper={paper} compact forceExpanded onPaperChange={updatePaperLocally} />
        </div>
      ) : null}
    </article>
  );
}

function formatScore(value: number | null): string {
  return typeof value === "number" ? value.toFixed(2) : "未评分";
}

async function throwIfNotOk(response: Response): Promise<Response> {
  if (!response.ok) throw new Error("Paper update failed.");
  return response;
}

function parseKeywordTagQuery(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
