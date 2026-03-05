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
  currentValueUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  livePrice?: number;
  livePriceTime?: number;
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
  sellPct: number | null;
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

const TRADERS = [
  { id: "gake", label: "gake" },
  { id: "intresting", label: "intresting" },
];

function fmt(val: number): string {
  if (Math.abs(val) >= 1_000_000) return (val / 1_000_000).toFixed(2) + "M";
  if (Math.abs(val) >= 1_000) return (val / 1_000).toFixed(2) + "K";
  return val.toFixed(2);
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
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m";
  return Math.floor(sec / 3600) + "h" + Math.floor((sec % 3600) / 60) + "m";
}

function TraderCard({ traderId }: { traderId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/paper/${traderId}/snapshot`)
      .then((r) => r.json())
      .then(setSnap)
      .catch(() => {});

    const es = new EventSource(`/api/paper/${traderId}/stream`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "snapshot" || data.type === "trade") {
          setSnap(data.type === "trade" ? data.state : data);
        }
      } catch {}
    };

    const iv = setInterval(() => {
      fetch(`/api/paper/${traderId}/snapshot`)
        .then((r) => r.json())
        .then(setSnap)
        .catch(() => {});
    }, 30000);

    return () => {
      es.close();
      clearInterval(iv);
    };
  }, [traderId]);

  if (!snap) {
    return (
      <div className="bg-card rounded-md px-3 py-2 text-xs text-muted-foreground">
        {traderId}: loading...
      </div>
    );
  }

  const i = snap.ideal;
  const p = snap.pessimistic;

  return (
    <div className="bg-card rounded-md px-3 py-2 text-xs space-y-1.5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <span className="font-bold text-sm">{snap.walletLabel}</span>
          <span className="text-muted-foreground">
            {snap.tradeCount} trades
          </span>
          <span className="text-[10px] text-muted-foreground">
            {expanded ? "▲" : "▼"}
          </span>
        </button>
        <span className="text-muted-foreground">
          fees: {usd(snap.totalFeesUsd)} | SOL {usd(snap.solPriceUsd)}
        </span>
      </div>

      {/* Scenario summary row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Ideal */}
        <div className="border-l-2 border-l-blue-500 pl-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Ideal</span>
            <span className="font-bold">{usd(i.totalValueUsd)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">P&L</span>
            <span className={`font-bold ${pnlColor(i.totalPnl)}`}>
              {pnlSign(i.totalPnl)}{usd(i.totalPnl)} ({pnlSign(i.totalPnlPct)}{i.totalPnlPct.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>cash: {usd(i.cashUsd)}</span>
            <span>open: {usd(i.openPositionValueUsd)}</span>
            <span>realized: <span className={pnlColor(i.realizedPnl)}>{pnlSign(i.realizedPnl)}{usd(i.realizedPnl)}</span></span>
          </div>
        </div>
        {/* Pessimistic */}
        <div className="border-l-2 border-l-orange-500 pl-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pessimistic (-{snap.pessimisticPct}%)</span>
            <span className="font-bold">{usd(p.totalValueUsd)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">P&L</span>
            <span className={`font-bold ${pnlColor(p.totalPnl)}`}>
              {pnlSign(p.totalPnl)}{usd(p.totalPnl)} ({pnlSign(p.totalPnlPct)}{p.totalPnlPct.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>cash: {usd(p.cashUsd)}</span>
            <span>open: {usd(p.openPositionValueUsd)}</span>
            <span>realized: <span className={pnlColor(p.realizedPnl)}>{pnlSign(p.realizedPnl)}{usd(p.realizedPnl)}</span></span>
          </div>
        </div>
      </div>

      {/* Expanded: positions + trades */}
      {expanded && (
        <>
          {/* Open positions */}
          {i.openPositions.length > 0 && (
            <div>
              <div className="text-[9px] text-muted-foreground font-semibold mb-0.5">
                OPEN POSITIONS
              </div>
              {i.openPositions.map((pos) => {
                const pp = p.openPositions.find((x) => x.mint === pos.mint);
                const hasLive = pos.livePriceTime && (Date.now() - pos.livePriceTime) < 300000;
                return (
                  <div
                    key={pos.mint}
                    className="flex items-center justify-between py-0.5"
                  >
                    <span>
                      <span className="font-bold">{pos.symbol}</span>{" "}
                      <span className="text-muted-foreground">{pos.name}</span>
                    </span>
                    <span className="flex gap-2">
                      <span className="text-muted-foreground">cost:{usd(pos.entryUsd)}</span>
                      {hasLive && (
                        <span className="text-blue-500">now:{usd(pos.currentValueUsd)}</span>
                      )}
                      <span className={pnlColor(pos.unrealizedPnl)}>
                        {pnlSign(pos.unrealizedPnl)}{usd(pos.unrealizedPnl)}
                        ({pnlSign(pos.unrealizedPnlPct)}{pos.unrealizedPnlPct.toFixed(1)}%)
                      </span>
                      <span className="text-muted-foreground">{timeAgo(pos.entryTime)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Trade log */}
          {snap.recentTrades.length > 0 && (
            <div>
              <div className="text-[9px] text-muted-foreground font-semibold mb-0.5">
                TRADE LOG
              </div>
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {snap.recentTrades.slice(0, 30).map((t, idx) => (
                  <div
                    key={t.originalTx || idx}
                    className="flex items-center justify-between text-[10px] py-0.5"
                  >
                    <div className="flex items-center gap-1">
                      <span
                        className={`font-bold px-1 rounded ${
                          t.type === "buy"
                            ? "bg-green-500/15 text-green-500"
                            : "bg-red-500/15 text-red-500"
                        }`}
                      >
                        {t.type === "buy" ? "B" : `S${t.sellPct != null ? ` ${(t.sellPct * 100).toFixed(0)}%` : ""}`}
                      </span>
                      <span className="font-semibold">{t.tokenSymbol}</span>
                      <span className="text-muted-foreground">
                        {usd(t.walletUsdVolume)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">
                        imp:{(t.priceImpact * 100).toFixed(2)}%
                      </span>
                      <span className="text-muted-foreground">
                        fee:{usd(t.feeUsd)}
                      </span>
                      <span className={pnlColor(t.idealPnl)}>
                        I:{pnlSign(t.idealPnl)}{usd(t.idealPnl)}
                      </span>
                      <span className={pnlColor(t.pessPnl)}>
                        P:{pnlSign(t.pessPnl)}{usd(t.pessPnl)}
                      </span>
                      <span className="text-muted-foreground">
                        {timeAgo(t.time)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PaperDashboard() {
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground font-semibold">
        PAPER TRADING — $2,000 start, $200 max/trade
      </div>
      {TRADERS.map((t) => (
        <TraderCard key={t.id} traderId={t.id} />
      ))}
    </div>
  );
}
