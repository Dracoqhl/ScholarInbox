"use client";

import { Star } from "lucide-react";

export function FavoriteButton({
  isFavorite,
  disabled,
  onClick
}: {
  isFavorite: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-muted transition hover:border-accent hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={isFavorite ? "取消收藏" : "收藏论文"}
      title={isFavorite ? "取消收藏" : "收藏论文"}
    >
      <Star className={isFavorite ? "h-4 w-4 fill-current text-accent" : "h-4 w-4"} />
    </button>
  );
}
