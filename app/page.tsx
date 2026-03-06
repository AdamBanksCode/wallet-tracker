"use client";

import { useState } from "react";
import SwapFeed from "@/components/swap-feed";
import PaperDashboard from "@/components/paper-dashboard";
import CopyAnalyzer from "@/components/copy-analyzer";
import ThemeToggle from "@/components/theme-toggle";

type Page = "live" | "paper" | "analysis";

export default function Home() {
  const [page, setPage] = useState<Page>("analysis");

  const navBtn = (key: Page, label: string) => (
    <button
      key={key}
      onClick={() => setPage(key)}
      className={`px-3 py-1 text-[10px] font-semibold border-r border-border transition-colors ${
        page === key
          ? "bg-amber-500/10 text-amber-500 dark:text-amber-400"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-0">
          <span className="text-amber-500 dark:text-amber-400 font-bold text-xs px-3 py-1 border-r border-border">WT</span>
          {navBtn("live", "LIVE FEED")}
          {navBtn("paper", "PAPER TRADING")}
          {navBtn("analysis", "ANALYSIS")}
        </div>
        <ThemeToggle />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {page === "live" && <SwapFeed />}
        {page === "paper" && <PaperDashboard />}
        {page === "analysis" && <CopyAnalyzer />}
      </div>
    </main>
  );
}
