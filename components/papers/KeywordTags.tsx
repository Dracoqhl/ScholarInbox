export function KeywordTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="rounded-md border border-line bg-background px-2 py-0.5 text-xs font-medium text-muted">
          {tag}
        </span>
      ))}
    </div>
  );
}
