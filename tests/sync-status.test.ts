import { describe, expect, it } from "vitest";

import { deriveSyncStatus } from "../lib/sync/status";

describe("sync status", () => {
  it("prioritizes failed, saving, dirty, then synced states", () => {
    expect(deriveSyncStatus({ dirtyCount: 1, pendingCount: 1, hasError: true })).toBe("failed");
    expect(deriveSyncStatus({ dirtyCount: 1, pendingCount: 1, hasError: false })).toBe("saving");
    expect(deriveSyncStatus({ dirtyCount: 1, pendingCount: 0, hasError: false })).toBe("dirty");
    expect(deriveSyncStatus({ dirtyCount: 0, pendingCount: 0, hasError: false })).toBe("synced");
  });
});
