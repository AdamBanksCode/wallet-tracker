import SwapFeed from "@/components/swap-feed";
import PaperDashboard from "@/components/paper-dashboard";
import ThemeToggle from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-3 space-y-5">
        {/* Header */}
        <header className="flex items-center justify-between py-2 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-gradient-to-b from-blue-500 to-violet-500" />
            <div>
              <h1 className="text-base font-bold tracking-tight leading-none">
                Wallet Tracker
              </h1>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Copy trade signals & paper trading
              </p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        {/* Paper Trading Section */}
        <PaperDashboard />

        {/* Live Feed Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Live Feed
            </h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <SwapFeed />
        </section>
      </div>
    </main>
  );
}
