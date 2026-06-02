import { ManualCrawlForm } from "@/components/crawls/ManualCrawlForm";
import { AppShell } from "@/components/app-shell/AppShell";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default function CrawlsPage() {
  return (
    <AppShell>
      <div className="space-y-4">
        <SettingsForm />
        <ManualCrawlForm />
      </div>
    </AppShell>
  );
}
