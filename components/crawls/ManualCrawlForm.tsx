"use client";

import { useState } from "react";

import { getDefaultManualCrawlDateRange } from "@/lib/crawls/date-range";

type CrawlRunResponse = {
  run: {
    status: string;
    fetchedCount: number;
    insertedCount: number;
    duplicateCount: number;
    errorMessage: string | null;
  };
};

export function ManualCrawlForm() {
  const defaultDateRange = getDefaultManualCrawlDateRange();
  const [dateFrom, setDateFrom] = useState(defaultDateRange.dateFrom);
  const [dateTo, setDateTo] = useState(defaultDateRange.dateTo);
  const [categories, setCategories] = useState("cs.CL, cs.AI, cs.LG");
  const [result, setResult] = useState<CrawlRunResponse["run"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRunning(true);
    setError(null);
    setResult(null);
    const response = await fetch("/api/crawls/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dateFrom,
        dateTo,
        categories: categories.split(",").map((item) => item.trim()).filter(Boolean)
      })
    });
    setIsRunning(false);
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "抓取失败");
      return;
    }
    const data = (await response.json()) as CrawlRunResponse;
    setResult(data.run);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold">手动抓取</h2>
        <p className="mt-1 text-sm text-muted">选择日期范围，从 arXiv 抓取并去重入库。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium">开始日期</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">结束日期</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">arXiv 分类</span>
          <input value={categories} onChange={(event) => setCategories(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
        </label>
      </div>
      <button type="submit" disabled={isRunning} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60">
        {isRunning ? "抓取中..." : "开始抓取"}
      </button>
      {error ? <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}
      {result ? (
        <div className="grid gap-3 rounded-md border border-line bg-background p-4 text-sm sm:grid-cols-4">
          <span>状态：{result.status}</span>
          <span>抓取：{result.fetchedCount}</span>
          <span>新增：{result.insertedCount}</span>
          <span>重复：{result.duplicateCount}</span>
        </div>
      ) : null}
    </form>
  );
}
