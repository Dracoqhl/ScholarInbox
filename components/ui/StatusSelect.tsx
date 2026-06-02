"use client";

import type { PaperStatus } from "@/lib/papers/types";

const statusOptions: Array<{ value: PaperStatus; label: string }> = [
  { value: "new", label: "新论文" },
  { value: "general", label: "一般" },
  { value: "interested", label: "感兴趣" },
  { value: "reading", label: "阅读中" },
  { value: "done", label: "已读" },
  { value: "archived", label: "归档" },
  { value: "irrelevant", label: "方向无关" }
];

export function StatusSelect({
  value,
  disabled,
  onChange
}: {
  value: PaperStatus;
  disabled?: boolean;
  onChange: (status: PaperStatus) => void;
}) {
  const current = statusOptions.find((option) => option.value === value) ?? statusOptions[0];

  return (
    <div className="group relative inline-block">
      <button
        type="button"
        disabled={disabled}
        className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
        aria-label="阅读状态"
      >
        {current.label}
      </button>
      <div className="invisible absolute right-0 top-full z-20 mt-1 min-w-28 rounded-md border border-line bg-surface p-1 opacity-0 shadow-sm transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {statusOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={[
              "block w-full rounded px-2 py-1.5 text-left text-sm transition",
              option.value === value ? "bg-accent/10 text-accent" : "text-primary hover:bg-background"
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
