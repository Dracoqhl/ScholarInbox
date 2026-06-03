"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { UserTag } from "@/lib/papers/types";

const tagPalette = ["#2563eb", "#16a34a", "#9333ea", "#dc2626", "#ca8a04", "#0891b2", "#c2410c", "#4f46e5"];

export function UserTagPicker({
  paperId,
  selectedTags,
  availableTags,
  disabled,
  onCreateTag,
  onChange
}: {
  paperId: string;
  selectedTags: UserTag[];
  availableTags: UserTag[];
  disabled?: boolean;
  onCreateTag: (input: { name: string; color: string }) => Promise<UserTag>;
  onChange: (paperId: string, tags: UserTag[]) => Promise<void>;
}) {
  const [newTagName, setNewTagName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const selectedIds = useMemo(() => new Set(selectedTags.map((tag) => tag.id)), [selectedTags]);
  const unselectedTags = availableTags.filter((tag) => !selectedIds.has(tag.id));

  async function addExistingTag(tagId: string) {
    const tag = availableTags.find((item) => item.id === tagId);
    if (!tag) return;
    await onChange(paperId, [...selectedTags, tag]);
  }

  async function removeTag(tagId: string) {
    await onChange(paperId, selectedTags.filter((tag) => tag.id !== tagId));
  }

  async function createAndAddTag() {
    const name = newTagName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const tag = await onCreateTag({ name, color: tagPalette[availableTags.length % tagPalette.length] });
      setNewTagName("");
      if (!selectedIds.has(tag.id)) {
        await onChange(paperId, [...selectedTags, tag]);
      }
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedTags.length === 0 ? <span className="text-xs text-muted">未添加自定义标签</span> : null}
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
            style={{ backgroundColor: `${tag.color}1a`, color: tag.color, border: `1px solid ${tag.color}55` }}
          >
            {tag.name}
            <button
              type="button"
              disabled={disabled}
              onClick={() => void removeTag(tag.id)}
              className="rounded p-0.5 hover:bg-surface/60 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={`移除标签 ${tag.name}`}
              title="移除标签"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value=""
          disabled={disabled || unselectedTags.length === 0}
          onChange={(event) => {
            void addExistingTag(event.target.value);
            event.currentTarget.value = "";
          }}
          className="h-8 rounded-md border border-line bg-background px-2 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="添加已有自定义标签"
        >
          <option value="">添加标签</option>
          {unselectedTags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <label className="flex h-8 min-w-0 items-center rounded-md border border-line bg-background focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
          <input
            value={newTagName}
            disabled={disabled || isCreating}
            onChange={(event) => setNewTagName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createAndAddTag();
              }
            }}
            placeholder="新标签"
            className="h-full w-28 bg-transparent px-2 text-xs outline-none disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled={disabled || isCreating || !newTagName.trim()}
            onClick={() => void createAndAddTag()}
            className="inline-flex h-full w-8 items-center justify-center text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="创建自定义标签"
            title="创建自定义标签"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </label>
      </div>
    </div>
  );
}
