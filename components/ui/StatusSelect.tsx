"use client";

import type { PaperStatus } from "@/lib/papers/types";

const statusOptions: Array<{ value: PaperStatus; label: string }> = [
  { value: "new", label: "新论文" },
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
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as PaperStatus)}
      className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
      aria-label="阅读状态"
    >
      {statusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
