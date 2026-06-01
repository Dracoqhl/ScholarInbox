import { AppShell } from "@/components/app-shell/AppShell";
import { PaperDetail } from "@/components/papers/PaperDetail";

export default function PaperDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <PaperDetail id={params.id} />
    </AppShell>
  );
}
