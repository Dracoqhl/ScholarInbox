"use client";

import { Check, Clipboard, Play, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { TopicSearchProfile, TopicSearchSource } from "@/lib/topic-search/profile";
import type { TopicSearchLogEntry, TopicSearchRun } from "@/lib/topic-search/types";

const ALL_SOURCES: Array<{ id: TopicSearchSource; label: string; disabled?: boolean }> = [
  { id: "arxiv", label: "arXiv" },
  { id: "semantic_scholar", label: "Semantic Scholar" },
  { id: "openreview", label: "OpenReview（后续）", disabled: true }
];

type ProfilesResponse = {
  profiles: TopicSearchProfile[];
};

type RunsResponse = {
  runs: TopicSearchRun[];
};

type TopicSearchStreamEvent =
  | { type: "log"; log: TopicSearchLogEntry }
  | { type: "run"; run: TopicSearchRun }
  | { type: "error"; error: string }
  | { type: "heartbeat"; at: string };

export function TopicSearchPanel() {
  const [profiles, setProfiles] = useState<TopicSearchProfile[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const selectedProfile = useMemo(() => profiles.find((profile) => profile.slug === selectedSlug) ?? null, [profiles, selectedSlug]);
  const [publicTag, setPublicTag] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sources, setSources] = useState<TopicSearchSource[]>(["arxiv", "semantic_scholar"]);
  const [maxResults, setMaxResults] = useState(100);
  const [run, setRun] = useState<TopicSearchRun | null>(null);
  const [logs, setLogs] = useState<TopicSearchLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadProfiles() {
      setIsLoading(true);
      const response = await fetch("/api/topic-search/profiles").catch(() => null);
      if (!response?.ok) {
        if (!cancelled) setError("专题 Profile 加载失败");
        setIsLoading(false);
        return;
      }
      const data = (await response.json()) as ProfilesResponse;
      if (cancelled) return;
      setProfiles(data.profiles);
      const firstProfile = data.profiles[0];
      if (firstProfile) {
        setSelectedSlug(firstProfile.slug);
        applyProfile(firstProfile);
      }
      setIsLoading(false);
    }
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadLatestRun() {
      const response = await fetch("/api/topic-search/runs?limit=1").catch(() => null);
      if (!response?.ok) return;
      const data = (await response.json()) as RunsResponse;
      const latestRun = data.runs[0];
      if (cancelled || !latestRun) return;
      setRun(latestRun);
      setLogs(latestRun.logs);
    }
    void loadLatestRun();
    return () => {
      cancelled = true;
    };
  }, []);

  function selectProfile(slug: string) {
    setSelectedSlug(slug);
    const profile = profiles.find((item) => item.slug === slug);
    if (profile) applyProfile(profile);
  }

  function applyProfile(profile: TopicSearchProfile) {
    setPublicTag(profile.publicTag);
    setDateFrom(profile.dateFrom);
    setDateTo(profile.dateTo);
    const enabledSources = profile.sources.filter((source) => !ALL_SOURCES.find((item) => item.id === source)?.disabled);
    setSources(enabledSources.length ? enabledSources : ["arxiv", "semantic_scholar"]);
  }

  function toggleSource(source: TopicSearchSource) {
    setSources((current) => {
      if (current.includes(source)) {
        return current.length === 1 ? current : current.filter((item) => item !== source);
      }
      return [...current, source];
    });
  }

  async function saveProfile() {
    if (!selectedProfile) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/topic-search/profiles/${selectedProfile.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicTag, dateFrom, dateTo, sources })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Profile 保存失败");
        return;
      }
      const data = (await response.json()) as { profile: TopicSearchProfile };
      setProfiles((current) => current.map((profile) => (profile.slug === data.profile.slug ? data.profile : profile)));
      applyProfile(data.profile);
    } finally {
      setIsSaving(false);
    }
  }

  async function runSearch() {
    if (!selectedProfile) return;
    setIsRunning(true);
    setError(null);
    setRun(null);
    setCopied(false);
    setLogs([
      {
        at: new Date().toISOString(),
        level: "info",
        stage: "submitted",
        message: "Submitted topic search request.",
        details: { profileSlug: selectedProfile.slug, dateFrom, dateTo, sources, maxResults }
      }
    ]);
    try {
      const response = await fetch("/api/topic-search/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileSlug: selectedProfile.slug,
          dateFrom,
          dateTo,
          sources,
          maxResults
        })
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        const message = data?.error ?? "专题检索失败";
        setError(message);
        appendClientLog("error", message);
        return;
      }
      if (response.body && response.headers.get("content-type")?.includes("application/x-ndjson")) {
        await readSearchStream(response.body);
      } else {
        const data = (await response.json()) as { run: TopicSearchRun };
        setRun(data.run);
        setLogs(data.run.logs);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "专题检索失败";
      setError(message);
      appendClientLog("error", message);
    } finally {
      setIsRunning(false);
    }
  }

  async function readSearchStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const readLine = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as TopicSearchStreamEvent;
      if (event.type === "log") setLogs((current) => [...current, event.log]);
      if (event.type === "run") {
        setRun(event.run);
        setLogs(event.run.logs);
      }
      if (event.type === "error") {
        setError(event.error);
        appendClientLog("error", event.error);
      }
    };

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        readLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) readLine(buffer);
  }

  function appendClientLog(level: TopicSearchLogEntry["level"], message: string) {
    setLogs((current) => [...current, { at: new Date().toISOString(), level, message }]);
  }

  async function copyLogs() {
    if (!logs.length) return;
    await navigator.clipboard.writeText(formatLogsForCopy(logs, run));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-line bg-surface p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">专题检索</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              按本地 Profile 做半年以上跨度的定向检索，通过过滤后进入新论文首页，并自动打公共标签。
            </p>
          </div>
          <Search className="h-5 w-5 text-accent" aria-hidden="true" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form className="space-y-4 rounded-md border border-line bg-surface p-5" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Profile</span>
              <select
                value={selectedSlug}
                onChange={(event) => selectProfile(event.target.value)}
                disabled={isLoading || profiles.length === 0}
                className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              >
                {profiles.length ? profiles.map((profile) => (
                  <option key={profile.slug} value={profile.slug}>{profile.label}</option>
                )) : <option value="">未找到 Profile</option>}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">公共标签</span>
              <input value={publicTag} onChange={(event) => setPublicTag(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">开始日期</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">结束日期</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">检索渠道</span>
            <div className="flex flex-wrap gap-2">
              {ALL_SOURCES.map((source) => (
                <label key={source.id} className={["inline-flex items-center gap-2 rounded-md border border-line bg-background px-3 py-2 text-sm text-muted", source.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent hover:text-primary"].join(" ")}>
                  <input type="checkbox" checked={sources.includes(source.id)} disabled={source.disabled} onChange={() => toggleSource(source.id)} className="h-4 w-4 accent-[oklch(var(--accent))]" />
                  {source.label}
                </label>
              ))}
            </div>
          </div>

          <label className="block max-w-xs space-y-1 text-sm">
            <span className="font-medium">检索上限</span>
            <input type="number" min={1} max={500} value={maxResults} onChange={(event) => setMaxResults(clampMaxResults(Number(event.target.value)))} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!selectedProfile || isSaving} onClick={() => void saveProfile()} className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-muted hover:border-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="h-4 w-4" />
              {isSaving ? "保存中..." : "保存 Profile"}
            </button>
            <button type="submit" disabled={!selectedProfile || isRunning} className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60">
              <Play className="h-4 w-4" />
              {isRunning ? "检索中..." : "开始专题检索"}
            </button>
          </div>

          {error ? <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
        </form>

        <aside className="rounded-md border border-line bg-surface p-5">
          <h3 className="text-sm font-semibold">运行结果</h3>
          {run ? (
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Metric label="状态" value={formatRunStatus(run.status)} />
              <Metric label="候选" value={run.candidateCount} />
              <Metric label="去重后" value={run.dedupedCount} />
              <Metric label="通过" value={run.acceptedCount} />
              <Metric label="新增" value={run.insertedCount} />
              <Metric label="已存在" value={run.existingCount} />
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted">运行后会显示候选、去重、通过过滤和入库数量。</p>
          )}
        </aside>
      </div>

      <section className="rounded-md border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold">专题检索日志</h3>
          <button type="button" onClick={copyLogs} disabled={!logs.length} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-50">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? "已复制" : "复制日志"}
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto px-4 py-3">
          {logs.length ? (
            <ol className="space-y-3 text-xs">
              {logs.map((log, index) => (
                <li key={`${log.at}-${index}`} className="font-mono leading-5">
                  <div className={log.level === "error" ? "text-danger" : "text-primary"}>
                    [{formatTime(log.at)}] {log.level.toUpperCase()} {formatStage(log.stage)} {log.message}
                  </div>
                  {log.details ? <pre className="mt-1 whitespace-pre-wrap break-words text-muted">{JSON.stringify(log.details, null, 2)}</pre> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">暂无日志</p>
          )}
        </div>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-line bg-background p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function formatLogsForCopy(logs: TopicSearchLogEntry[], run: TopicSearchRun | null): string {
  const header = run
    ? [`status=${run.status}`, `candidates=${run.candidateCount}`, `deduped=${run.dedupedCount}`, `accepted=${run.acceptedCount}`, `inserted=${run.insertedCount}`, `existing=${run.existingCount}`, `error=${run.errorMessage ?? ""}`].join(" ")
    : "status=pending";
  return [
    header,
    ...logs.map((log) => {
      const details = log.details ? ` ${JSON.stringify(log.details)}` : "";
      const stage = log.stage ? ` stage=${log.stage}` : "";
      return `[${log.at}] ${log.level.toUpperCase()}${stage} ${log.message}${details}`;
    })
  ].join("\n");
}

function clampMaxResults(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(500, Math.trunc(value)));
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatStage(stage: TopicSearchLogEntry["stage"]): string {
  switch (stage) {
    case "submitted":
      return "已提交";
    case "retrieving":
      return "检索";
    case "deduplicating":
      return "去重";
    case "filtering":
      return "过滤";
    case "storing":
      return "入库";
    case "homepage_analysis":
      return "首页解析";
    case "pdf_analysis":
      return "PDF 精读";
    case "completed":
      return "完成";
    case "failed":
      return "失败";
    default:
      return "等待";
  }
}

function formatRunStatus(status: TopicSearchRun["status"]): string {
  switch (status) {
    case "running":
      return "运行中";
    case "completed":
      return "完成";
    case "failed":
      return "失败";
    default:
      return status;
  }
}
