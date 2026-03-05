import SwapFeed from "@/components/swap-feed";
import ThemeToggle from "@/components/theme-toggle";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Wallet Tracker
            </h1>
            <p className="text-xs text-muted-foreground">
              Shred-decoded swap feed — ahead of on-chain confirmation
            </p>
          </div>
          <ThemeToggle />
        </div>
        <SwapFeed />
      </div>
    </main>
  );
}
