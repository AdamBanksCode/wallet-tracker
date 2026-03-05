import SwapFeed from "@/components/swap-feed";
import PaperDashboard from "@/components/paper-dashboard";
import ThemeToggle from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Wallet Tracker
            </h1>
            <p className="text-xs text-muted-foreground">
              Real-time wallet swap feed
            </p>
          </div>
          <ThemeToggle />
        </div>
        <PaperDashboard />
        <SwapFeed />
      </div>
    </main>
  );
}
