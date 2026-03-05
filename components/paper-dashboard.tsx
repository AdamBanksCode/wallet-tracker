"use client";

import { useEffect, useState } from "react";

interface Position {
  mint: string;
  symbol: string;
  name: string;
  tokens: number;
  avgEntryPrice: number;
  entryUsd: number;
  entryTime: number;
}

interface ScenarioData {
  cashUsd: number;
  openPositionValueUsd: number;
  totalValueUsd: number;
  realizedPnl: number;
  realizedPnlPct: number;
  totalPnl: number;
  totalPnlPct: number;
  openPositions: Position[];
}

interface Trade {
  time: number;
  type: string;
  tokenSymbol: string;
  tokenName: string;
  walletSolAmount: number;
  walletUsdVolume: number;
  quotedPriceUsd: number;
  priceImpact: number;
  feeUsd: number;
  idealBalance: number;
  idealPnl: number;
  pessBalance: number;
  pessPnl: number;
  hadQuote: boolean;
  originalTx: string;
}

interface Snapshot {
  walletLabel: string;
  wallet: string;
  startedAt: number;
  startingBalanceUsd: number;
  solPriceUsd: number;
  tradeCount: number;
  totalFeesUsd: number;
  pessimisticPct: number;
  ideal: ScenarioData;
  pessimistic: ScenarioData;
  recentTrades: Trade[];
}

function fmt(val: number, decimals = 2): string {
  if (Math.abs(val) >= 1_000_000) return (val / 1_000_000).toFixed(2) + "M";
  if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(2) + "K";
  return val.toFixed(decimals);
}

function usd(val: number): string {
  return "$" + fmt(val);
}

function pnlColor(val: number): string {
  if (val > 0) return "text-green-500";
  if (val < 0) return "text-red-500";
  return "text-muted-foreground";
}

function pnlSign(val: number): string {
  return val >= 0 ? "+" : "";
}

function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return sec + "s ago";
  if (sec < 3600) return Math.floor(sec / 60) + "m ago";
  return Math.floor(sec / 3600) + "h " + Math.floor((sec % 3600) / 60) + "m ago";
}

function ScenarioCard({
  label,
  data,
  startingBalance,
  accent,
}: {
  label: string;
  data: ScenarioData;
  startingBalance: number;
  accent: string;
}) {
  return (
    <div className={`border-l-2 rounded-md bg-card px-3 py-2 ${accent}`}>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-bold">{label}</span>
        <span className="text-muted-foreground">
          {data.openPositions.length} open
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Total Value</div>
          <div className="font-bold text-sm">{usd(data.totalValueUsd)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Cash</div>
          <div className="font-semibold">{usd(data.cashUsd)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">In Positions</div>
          <div className="font-semibold">{usd(data.openPositionValueUsd)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mt-1.5">
        <div>
          <span className="text-muted-foreground">Realized P&L: </span>
          <span className={`font-bold ${pnlColor(data.realizedPnl)}`}>
            {pnlSign(data.realizedPnl)}
            {usd(data.realizedPnl)} ({pnlSign(data.realizedPnlPct)}
            {data.realizedPnlPct.toFixed(1)}%)
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Total P&L: </span>
          <span className={`font-bold ${pnlColor(data.totalPnl)}`}>
            {pnlSign(data.totalPnl)}
            {usd(data.totalPnl)} ({pnlSign(data.totalPnlPct)}
            {data.totalPnlPct.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PaperDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initial fetch
    fetch("/api/paper/snapshot")
      .then((r) => r.json())
      .then((data) => {
        setSnapshot(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // SSE for live updates
    const es = new EventSource("/api/paper/stream");
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "snapshot" || data.type === "trade") {
          const snap = data.type === "trade" ? data.state : data;
          setSnapshot(snap);
          setLoading(false);
        }
      } catch {}
    };
    es.onerror = () => {};

    // Refresh snapshot every 30s as fallback
    const iv = setInterval(() => {
      fetch("/api/paper/snapshot")
        .then((r) => r.json())
        .then(setSnapshot)
        .catch(() => {});
    }, 30000);

    return () => {
      es.close();
      clearInterval(iv);
    };
  }, []);

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-8 text-xs">
        Loading paper trading data...
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="text-center text-muted-foreground py-8 text-xs">
        Paper trader offline
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between text-xs">
        <div>
          <span className="font-bold">Paper Trading</span>
          <span className="text-muted-foreground ml-1.5">
            copying {snapshot.walletLabel} | SOL {usd(snapshot.solPriceUsd)}
          </span>
        </div>
        <div className="text-muted-foreground">
          {snapshot.tradeCount} trades | fees: {usd(snapshot.totalFeesUsd)}
        </div>
      </div>

      {/* Scenario cards side by side */}
      <div className="grid grid-cols-2 gap-2">
        <ScenarioCard
          label="Ideal"
          data={snapshot.ideal}
          startingBalance={snapshot.startingBalanceUsd}
          accent="border-l-blue-500"
        />
        <ScenarioCard
          label={`Pessimistic (-${snapshot.pessimisticPct}%)`}
          data={snapshot.pessimistic}
          startingBalance={snapshot.startingBalanceUsd}
          accent="border-l-orange-500"
        />
      </div>

      {/* Open positions */}
      {snapshot.ideal.openPositions.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1 font-semibold">
            OPEN POSITIONS
          </div>
          <div className="space-y-1">
            {snapshot.ideal.openPositions.map((pos) => {
              const pessPos = snapshot.pessimistic.openPositions.find(
                (p) => p.mint === pos.mint
              );
              return (
                <div
                  key={pos.mint}
                  className="bg-card rounded px-2 py-1.5 text-xs flex items-center justify-between"
                >
                  <div>
                    <span className="font-bold">{pos.symbol}</span>
                    <span className="text-muted-foreground ml-1">
                      {pos.name}
                    </span>
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    <span>
                      <span className="text-muted-foreground">cost: </span>
                      <span className="text-blue-500 font-medium">
                        {usd(pos.entryUsd)}
                      </span>
                    </span>
                    {pessPos && (
                      <span>
                        <span className="text-muted-foreground">pess: </span>
                        <span className="text-orange-500 font-medium">
                          {usd(pessPos.entryUsd)}
                        </span>
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {timeAgo(pos.entryTime)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent trades */}
      {snapshot.recentTrades.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground mb-1 font-semibold">
            TRADE LOG
          </div>
          <div className="space-y-0.5">
            {snapshot.recentTrades.slice(0, 20).map((trade, i) => (
              <div
                key={trade.originalTx || i}
                className="flex items-center justify-between text-[10px] px-2 py-1 bg-card rounded"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-bold px-1 py-0.5 rounded ${
                      trade.type === "buy"
                        ? "bg-green-500/15 text-green-500"
                        : "bg-red-500/15 text-red-500"
                    }`}
                  >
                    {trade.type === "buy" ? "BUY" : "SELL"}
                  </span>
                  <span className="font-semibold">{trade.tokenSymbol}</span>
                  <span className="text-muted-foreground">
                    {usd(trade.walletUsdVolume)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    impact: {(trade.priceImpact * 100).toFixed(2)}%
                  </span>
                  <span className="text-muted-foreground">
                    fee: {usd(trade.feeUsd)}
                  </span>
                  <span className={pnlColor(trade.idealPnl)}>
                    I: {pnlSign(trade.idealPnl)}
                    {usd(trade.idealPnl)}
                  </span>
                  <span className={pnlColor(trade.pessPnl)}>
                    P: {pnlSign(trade.pessPnl)}
                    {usd(trade.pessPnl)}
                  </span>
                  <span className="text-muted-foreground">
                    {timeAgo(trade.time)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
