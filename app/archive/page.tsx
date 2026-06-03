import { AppShell } from "@/components/app-shell/AppShell";
import { PaperList } from "@/components/papers/PaperList";

export default function ArchivePage() {
  return (
    <AppShell>
      <PaperList mode="archive" />
    </AppShell>
  );
}
