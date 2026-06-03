export type SyncStatus = "synced" | "dirty" | "saving" | "failed";

export function deriveSyncStatus(input: { dirtyCount: number; pendingCount: number; hasError: boolean }): SyncStatus {
  if (input.hasError) return "failed";
  if (input.pendingCount > 0) return "saving";
  if (input.dirtyCount > 0) return "dirty";
  return "synced";
}
