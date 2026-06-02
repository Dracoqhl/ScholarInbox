"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

import { getDefaultManualCrawlDateRange, getManualCrawlDateRangeForDays } from "@/lib/crawls/date-range";
import type { CrawlLogEntry } from "@/lib/crawls/types";

type CrawlRunResponse = {
  run: {
    status: string;
    fetchedCount: number;
    insertedCount: number;
    duplicateCount: number;
    errorMessage: string | null;
    logs: CrawlLogEntry[];
  };
};

type DatePreset = "1" | "3" | "7" | "custom";

export function ManualCrawlForm() {
  const defaultDateRange = getDefaultManualCrawlDateRange();
  const [dateFrom, setDateFrom] = useState(defaultDateRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultDateRange.dateTo);
  const [datePreset, setDatePreset] = useState<DatePreset>("7");
  const [categories, setCategories] = useState("cs.CL, cs.AI, cs.LG");
  const [maxResults, setMaxResults] = useState(200);
  const [result, setResult] = useState<CrawlRunResponse["run"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<CrawlLogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  function applyPreset(days: 1 | 3 | 7) {
    const range = getManualCrawlDateRangeForDays(days);
    setDatePreset(String(days) as DatePreset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  }

  function updateDateFrom(value: string) {
    setDatePreset("custom");
    setDateFrom(value);
  }

  function updateDateTo(value: string) {
    setDatePreset("custom");
    setDateTo(value);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRunning(true);
    setError(null);
    setResult(null);
    setCopied(false);
    setLogs([{
      at: new Date().toISOString(),
      level: "info",
      message: "Submitted manual crawl request.",
      details: {
        categories: categories.split(",").map((item) => item.trim()).filter(Boolean),
        dateFrom,
        dateTo,
        maxResults
      }
    }]);
    const response = await fetch("/api/crawls/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateFrom,
        dateTo,
        categories: categories.split(",").map((item) => item.trim()).filter(Boolean),
        maxResults
      })
    });
    setIsRunning(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "抓取失败");
      setLogs((currentLogs) => [
        ...currentLogs,
        {
          at: new Date().toISOString(),
          level: "error",
          message: data?.error ?? "Manual crawl request failed."
        }
      ]);
      return;
    }
    const data = (await response.json()) as CrawlRunResponse;
    setResult(data.run);
    setLogs(data.run.logs);
  }

  async function copyLogs() {
    if (logs.length === 0) return;
    await navigator.clipboard.writeText(formatLogsForCopy(logs, result));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold">手动抓取</h2>
        <p className="mt-1 text-sm text-muted">选择日期范围，从 arXiv 抓取并去重入库。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="font-medium">开始日期</span>
          <input type="date" value={dateFrom} onChange={(event) => updateDateFrom(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">结束日期</span>
          <input type="date" value={dateTo} onChange={(event) => updateDateTo(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">arXiv 分类</span>
          <input value={categories} onChange={(event) => setCategories(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">抓取上限</span>
          <input type="number" min={1} max={500} value={maxResults} onChange={(event) => setMaxResults(clampMaxResults(Number(event.target.value)))} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => applyPreset(1)} className={presetButtonClass(datePreset === "1")}>最近 1 天</button>
        <button type="button" onClick={() => applyPreset(3)} className={presetButtonClass(datePreset === "3")}>最近 3 天</button>
        <button type="button" onClick={() => applyPreset(7)} className={presetButtonClass(datePreset === "7")}>最近 7 天</button>
        <button type="button" onClick={() => setDatePreset("custom")} className={presetButtonClass(datePreset === "custom")}>自定义</button>
      </div>
      <button type="submit" disabled={isRunning} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60">
        {isRunning ? "抓取中..." : "开始抓取"}
      </button>
      {error ? <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {result ? (
        <div className="grid gap-3 rounded-md border border-line bg-background p-4 text-sm sm:grid-cols-4">
          <span>状态：{result.status}</span>
          <span>抓取：{result.fetchedCount}</span>
          <span>有效新增：{result.insertedCount}</span>
          <span>已校验跳过：{result.duplicateCount}</span>
        </div>
      ) : null}
      <section className="rounded-md border border-line bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold">抓取日志</h3>
          <button type="button" onClick={copyLogs} disabled={logs.length === 0} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? "已复制" : "复制日志"}
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto px-4 py-3">
          {logs.length ? (
            <ol className="space-y-3 text-xs">
              {logs.map((log, index) => (
                <li key={`${log.at}-${index}`} className="font-mono leading-5">
                  <div className={log.level === "error" ? "text-danger" : "text-foreground"}>
                    [{formatTime(log.at)}] {log.level.toUpperCase()} {log.message}
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
    </form>
  );
}

function presetButtonClass(active: boolean): string {
  return [
    "rounded-md border px-3 py-1.5 text-sm font-medium transition",
    active ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:border-accent hover:text-foreground"
  ].join(" ");
}

function formatLogsForCopy(logs: CrawlLogEntry[], result: CrawlRunResponse["run"] | null): string {
  const header = result
    ? [`status=${result.status}`, `fetched=${result.fetchedCount}`, `effectiveInserted=${result.insertedCount}`, `cachedSkipped=${result.duplicateCount}`, `error=${result.errorMessage ?? ""}`].join(" ")
    : "status=pending";
  return [
    header,
    ...logs.map((log) => {
      const details = log.details ? ` ${JSON.stringify(log.details)}` : "";
      return `[${log.at}] ${log.level.toUpperCase()} ${log.message}${details}`;
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
