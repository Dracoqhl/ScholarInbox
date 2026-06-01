import { AppShell } from "@/components/app-shell/AppShell";
import { PaperList } from "@/components/papers/PaperList";

export default function FavoritesPage() {
  return (
    <AppShell>
      <PaperList favoriteOnly />
    </AppShell>
  );
}
