import Link from "next/link";

import { SyncStatusBadge, SyncStatusProvider } from "@/components/sync/SyncStatusProvider";

const navItems = [
  { href: "/", label: "论文" },
  { href: "/archive", label: "归档" },
  { href: "/favorites", label: "收藏" },
  { href: "/topic-search", label: "专题检索" },
  { href: "/crawls", label: "抓取" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SyncStatusProvider>
      <main className="min-h-screen bg-background text-primary">
        <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-accent">ScholarInbox</p>
              <h1 className="mt-1 text-xl font-semibold">个人论文阅读收件箱</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SyncStatusBadge />
              <nav className="flex flex-wrap gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-5 py-6">{children}</div>
      </main>
    </SyncStatusProvider>
  );
}
