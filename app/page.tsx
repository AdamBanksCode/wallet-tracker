import SwapFeed from "@/components/swap-feed";
import PaperDashboard from "@/components/paper-dashboard";

export default function Home() {
  return (
    <main className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-card text-[10px] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 font-bold">WT</span>
          <span className="text-muted-foreground">WALLET TRACKER</span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Paper trading panels */}
        <PaperDashboard />

        {/* Divider */}
        <div className="flex items-center px-2 py-0.5 border-b border-border bg-card shrink-0">
          <span className="text-[9px] text-amber-500 font-bold">LIVE FEED</span>
        </div>

        {/* Live swap feed */}
        <div className="flex-1 overflow-hidden">
          <SwapFeed />
        </div>
      </div>
    </main>
  );
}
