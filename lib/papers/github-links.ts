export function extractGithubUrls(text: string): string[] {
  const urls = new Set<string>();
  const pattern = /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:[/?#][^\s),.;]*)?/gi;

  for (const match of text.matchAll(pattern)) {
    const url = normalizeGithubRepoUrl(match[0]);
    if (url) urls.add(url);
  }

  return [...urls];
}

function normalizeGithubRepoUrl(value: string): string | null {
  try {
    const parsed = new URL(value.replace(/[.,;:!?]+$/g, ""));
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    return `https://github.com/${owner}/${repo.replace(/\.git$/i, "")}`;
  } catch {
    return null;
  }
}
