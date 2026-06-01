import { ManualCrawlForm } from "@/components/crawls/ManualCrawlForm";
import { AppShell } from "@/components/app-shell/AppShell";

export default function CrawlsPage() {
  return (
    <AppShell>
      <ManualCrawlForm />
    </AppShell>
  );
}
