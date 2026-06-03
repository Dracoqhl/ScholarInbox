"use client";

import { useEffect, useRef, useState } from "react";

import type { PaperStatus } from "@/lib/papers/types";

export type PaperStatusAction = PaperStatus | "favorite";

const statusOptions: Array<{ value: PaperStatusAction; label: string }> = [
  { value: "new", label: "新论文" },
  { value: "skipped", label: "略过" },
  { value: "archived", label: "归档" },
  { value: "favorite", label: "收藏" },
  { value: "irrelevant", label: "方向无关" }
];

export function StatusSelect({
  value,
  disabled,
  onChange
}: {
  value: PaperStatusAction;
  disabled?: boolean;
  onChange: (status: PaperStatusAction) => void;
}) {
  const current = statusOptions.find((option) => option.value === value) ?? statusOptions[0];
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        onFocus={() => setIsOpen(true)}
        className="h-9 rounded-md border border-line bg-surface px-2 text-sm text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
        aria-expanded={isOpen}
        aria-label="阅读状态"
      >
        {current.label}
      </button>
      <div
        className={[
          "absolute right-0 top-[calc(100%-1px)] z-20 min-w-28 rounded-md border border-line bg-surface p-1 shadow-sm transition",
          isOpen ? "visible opacity-100" : "invisible opacity-0"
        ].join(" ")}
      >
        {statusOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              onChange(option.value);
              setIsOpen(false);
            }}
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
