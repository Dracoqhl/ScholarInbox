"use client";

import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useSyncStatus } from "@/components/sync/SyncStatusProvider";
import type { Paper } from "@/lib/papers/types";

export function PaperUserNote({
  paper,
  compact = false,
  forceExpanded = false,
  onPaperChange
}: {
  paper: Paper;
  compact?: boolean;
  forceExpanded?: boolean;
  onPaperChange: (paper: Paper) => void;
}) {
  const { markDirty, trackSync } = useSyncStatus();
  const [draft, setDraft] = useState(paper.userNote);
  const [isExpanded, setIsExpanded] = useState(forceExpanded || !compact || Boolean(paper.userNote.trim()));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequence = useRef(0);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function updateNote(value: string) {
    setDraft(value);
    onPaperChange({ ...paper, userNote: value });
    const dirtyVersion = markDirty();

    if (saveTimer.current) clearTimeout(saveTimer.current);
    const sequence = saveSequence.current + 1;
    saveSequence.current = sequence;
    saveTimer.current = setTimeout(() => {
      void saveNote(paper.id, value, sequence, dirtyVersion);
    }, 700);
  }

  async function saveNote(paperId: string, value: string, sequence: number, dirtyVersion: number) {
    try {
      const response = await trackSync(
        fetch(`/api/papers/${paperId}/note`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userNote: value })
        }).then(throwIfNotOk),
        {
          cleanDirtyVersion: dirtyVersion,
          shouldApply: () => saveSequence.current === sequence
        }
      );
      const data = (await response.json()) as { paper?: Paper; error?: string };
      if (!response.ok || !data.paper) {
        throw new Error(data.error ?? "User note save failed.");
      }
      if (saveSequence.current !== sequence) return;
      onPaperChange({ ...data.paper, userNote: value });
    } catch {
      // Global sync status reports current save failures. Keep the local draft intact.
    }
  }

  if (compact && !forceExpanded && !isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        添加评论
      </button>
    );
  }

  return (
    <label className={`block rounded-md border border-line bg-background ${compact ? "p-3" : "p-4"}`}>
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <MessageSquare className="h-3.5 w-3.5" />
        我的评论
      </span>
      <textarea
        value={draft}
        onChange={(event) => updateNote(event.target.value)}
        placeholder="写下收藏理由、方向无关原因，或后续精读时要注意的问题。"
        className={`mt-2 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/25 ${
          compact ? "min-h-14" : "min-h-28"
        }`}
      />
    </label>
  );
}

async function throwIfNotOk(response: Response): Promise<Response> {
  if (!response.ok) {
    throw new Error("User note save failed.");
  }
  return response;
}
