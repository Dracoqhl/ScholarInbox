"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";

import { deriveSyncStatus, type SyncStatus } from "@/lib/sync/status";

type SyncStatusSnapshot = {
  status: SyncStatus;
  lastSyncedAt: Date | null;
};

type TrackSyncOptions = {
  cleanDirtyVersion?: number;
  shouldApply?: () => boolean;
};

type SyncStatusContextValue = {
  snapshot: SyncStatusSnapshot;
  markDirty: () => number;
  trackSync: <T>(operation: Promise<T>, options?: TrackSyncOptions) => Promise<T>;
};

const SyncStatusContext = createContext<SyncStatusContextValue | null>(null);

export function SyncStatusProvider({ children }: { children: React.ReactNode }) {
  const dirtyVersionRef = useRef(0);
  const [state, setState] = useState({
    dirtyVersion: 0,
    cleanVersion: 0,
    pendingCount: 0,
    hasError: false,
    lastSyncedAt: null as Date | null
  });

  const snapshot = useMemo<SyncStatusSnapshot>(() => {
    const dirtyCount = state.dirtyVersion > state.cleanVersion ? 1 : 0;
    return {
      status: deriveSyncStatus({ dirtyCount, pendingCount: state.pendingCount, hasError: state.hasError }),
      lastSyncedAt: state.lastSyncedAt
    };
  }, [state]);

  function markDirty(): number {
    const nextVersion = dirtyVersionRef.current + 1;
    dirtyVersionRef.current = nextVersion;
    setState((current) => ({
      ...current,
      dirtyVersion: nextVersion,
      hasError: false
    }));
    return nextVersion;
  }

  async function trackSync<T>(operation: Promise<T>, options: TrackSyncOptions = {}): Promise<T> {
    setState((current) => ({
      ...current,
      pendingCount: current.pendingCount + 1,
      hasError: false
    }));

    try {
      const result = await operation;
      if (options.shouldApply?.() ?? true) {
        setState((current) => ({
          ...current,
          cleanVersion: options.cleanDirtyVersion ? Math.max(current.cleanVersion, options.cleanDirtyVersion) : current.cleanVersion,
          lastSyncedAt: new Date()
        }));
      }
      return result;
    } catch (error) {
      if (options.shouldApply?.() ?? true) {
        setState((current) => ({
          ...current,
          hasError: true
        }));
      }
      throw error;
    } finally {
      setState((current) => ({
        ...current,
        pendingCount: Math.max(0, current.pendingCount - 1)
      }));
    }
  }

  const value = useMemo(() => ({ snapshot, markDirty, trackSync }), [snapshot]);

  return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>;
}

export function useSyncStatus(): SyncStatusContextValue {
  const context = useContext(SyncStatusContext);
  if (!context) {
    throw new Error("useSyncStatus must be used within SyncStatusProvider.");
  }
  return context;
}

export function SyncStatusBadge() {
  const { snapshot } = useSyncStatus();
  return (
    <span aria-label="全局保存状态" className={syncStatusClass(snapshot.status)} role="status">
      {formatSyncStatus(snapshot)}
    </span>
  );
}

function syncStatusClass(status: SyncStatus): string {
  const baseClass = "inline-flex h-9 min-w-24 items-center justify-center whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold";
  if (status === "dirty" || status === "saving") return `${baseClass} border-accent/30 bg-accent/10 text-accent`;
  if (status === "failed") return `${baseClass} border-danger/30 bg-danger/10 text-danger`;
  return `${baseClass} border-line bg-background text-muted`;
}

function formatSyncStatus(snapshot: SyncStatusSnapshot): string {
  if (snapshot.status === "dirty") return "未保存";
  if (snapshot.status === "saving") return "保存中...";
  if (snapshot.status === "failed") return "保存失败，继续编辑后会重试";
  if (snapshot.lastSyncedAt) {
    return `已保存 ${snapshot.lastSyncedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return "已保存";
}
