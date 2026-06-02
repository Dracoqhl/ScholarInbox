"use client";

import { useEffect, useState } from "react";

type AppSettings = {
  categories: string[];
  dailyCrawlTime: string;
  interestProfile: string;
};

export function SettingsForm() {
  const [categories, setCategories] = useState("");
  const [dailyCrawlTime, setDailyCrawlTime] = useState("08:00");
  const [interestProfile, setInterestProfile] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [apiTestMessage, setApiTestMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/settings");
      if (!response.ok) return;
      const data = (await response.json()) as { settings: AppSettings };
      setCategories(data.settings.categories.join(", "));
      setDailyCrawlTime(data.settings.dailyCrawlTime);
      setInterestProfile(data.settings.interestProfile);
    }
    void load();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categories: categories.split(",").map((item) => item.trim()).filter(Boolean),
        dailyCrawlTime,
        interestProfile
      })
    });
    setIsSaving(false);
    setMessage(response.ok ? "设置已保存" : "设置保存失败");
  }

  async function testApi() {
    setIsTestingApi(true);
    setApiTestMessage(null);
    const response = await fetch("/api/ai/test", { method: "POST" });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    setIsTestingApi(false);
    setApiTestMessage(data?.message ?? (response.ok ? "API 可用" : "API 测试失败"));
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border border-line bg-surface p-5">
      <div>
        <h2 className="text-lg font-semibold">抓取设置</h2>
        <p className="mt-1 text-sm text-muted">研究兴趣边界由内部偏好文件维护，这里只配置抓取分类、计划时间和 API 连通性。</p>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">arXiv 分类</span>
        <input value={categories} onChange={(event) => setCategories(event.target.value)} className="h-10 w-full rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">每日抓取时间</span>
        <input type="time" value={dailyCrawlTime} onChange={(event) => setDailyCrawlTime(event.target.value)} className="h-10 rounded-md border border-line bg-background px-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isSaving} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-surface disabled:cursor-not-allowed disabled:opacity-60">
          {isSaving ? "保存中..." : "保存设置"}
        </button>
        <button
          type="button"
          disabled={isTestingApi}
          onClick={() => void testApi()}
          className="rounded-md border border-line bg-background px-4 py-2 text-sm font-semibold text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isTestingApi ? "测试中..." : "测试 API"}
        </button>
      </div>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      {apiTestMessage ? <p className="rounded-md border border-line bg-background px-3 py-2 text-sm text-muted">{apiTestMessage}</p> : null}
    </form>
  );
}
