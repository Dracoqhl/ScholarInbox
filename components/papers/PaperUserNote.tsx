"use client";

import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Paper } from "@/lib/papers/types";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "failed";

export function PaperUserNote({
  paper,
  compact = false,
  onPaperChange
}: {
  paper: Paper;
  compact?: boolean;
  onPaperChange: (paper: Paper) => void;
}) {
  const [draft, setDraft] = useState(paper.userNote);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequence = useRef(0);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function updateNote(value: string) {
    setDraft(value);
    setSaveState("dirty");
    onPaperChange({ ...paper, userNote: value });

    if (saveTimer.current) clearTimeout(saveTimer.current);
    const sequence = saveSequence.current + 1;
    saveSequence.current = sequence;
    saveTimer.current = setTimeout(() => {
      void saveNote(paper.id, value, sequence);
    }, 700);
  }

  async function saveNote(paperId: string, value: string, sequence: number) {
    setSaveState("saving");
    try {
      const response = await fetch(`/api/papers/${paperId}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userNote: value })
      });
      const data = (await response.json()) as { paper?: Paper; error?: string };
      if (!response.ok || !data.paper) {
        throw new Error(data.error ?? "User note save failed.");
      }
      if (saveSequence.current !== sequence) return;
      onPaperChange({ ...data.paper, userNote: value });
      setLastSavedAt(new Date());
      setSaveState("saved");
    } catch {
      if (saveSequence.current === sequence) {
        setSaveState("failed");
      }
    }
  }

  return (
    <label className={`block rounded-md border border-line bg-background ${compact ? "mt-3 p-3" : "p-4"}`}>
      <span className="flex items-center justify-between gap-3 text-xs font-medium text-muted">
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" />
          我的评论
        </span>
        <span aria-label="评论保存状态" className={saveStatusClass(saveState)}>
          {formatSaveStatus(saveState, lastSavedAt)}
        </span>
      </span>
      <textarea
        value={draft}
        onChange={(event) => updateNote(event.target.value)}
        placeholder="写下收藏理由、方向无关原因，或后续精读时要注意的问题。"
        className={`mt-2 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 ${
          compact ? "min-h-16" : "min-h-28"
        }`}
      />
    </label>
  );
}

function saveStatusClass(saveState: SaveState): string {
  if (saveState === "dirty" || saveState === "saving") return "text-accent";
  if (saveState === "failed") return "text-danger";
  return "text-muted";
}

function formatSaveStatus(saveState: SaveState, lastSavedAt: Date | null): string {
  if (saveState === "dirty") return "未保存";
  if (saveState === "saving") return "保存中...";
  if (saveState === "failed") return "保存失败，继续编辑后会重试";
  if (saveState === "saved" && lastSavedAt) {
    return `已保存 ${lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return "已保存";
}
