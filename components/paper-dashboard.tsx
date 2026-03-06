"use client";

import { useEffect, useState, useMemo } from "react";

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
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  walletSolAmount: number;
  walletTokenAmount: number;
  walletUsdVolume: number;
  mcUsd: number | null;
  quotedPriceUsd: number;
  priceImpact: number;
  feeUsd: number;
  sellPct: number | null;
  idealTradePnl: number;
  pessTradePnl: number;
  idealBalance: number;
  idealPnl: number;
  pessBalance: number;
  pessPnl: number;
  hadQuote: boolean;
  originalTx: string;
  quoteLatencyMs?: number;
}

interface Snapshot {
  walletLabel: string;
  wallet: string;
  startedAt: number;
  startingBalanceUsd: number;
  solPriceUsd: number;
  tradeCount: number;
  totalFeesUsd: number;
  pessimisticPct?: number;
  slippagePct?: number;
  ideal: ScenarioData;
  pessimistic: ScenarioData;
  recentTrades: Trade[];
}

// Group buys/sells by token for the Tokens tab
interface TokenGroup {
  mint: string;
  symbol: string;
  name: string;
  buys: Trade[];
  sells: Trade[];
  totalBuyUsd: number;
  totalSellUsd: number;
  idealRealizedPnl: number;
  pessRealizedPnl: number;
  openPosition: Position | null;
  pessPosition: Position | null;
  lastTradeTime: number;
  entryMc: number | null;
  exitMc: number | null;
}

const TRADERS = [
  { id: "gake", label: "gake" },
  { id: "idontpaytaxes", label: "IDontPayTaxes" },
];

type Tab = "summary" | "positions" | "tokens" | "trades";

function fmt(val: number): string {
  const v = val ?? 0;
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(2) + "K";
  return v.toFixed(2);
}

function usd(val: number): string {
  return "$" + fmt(val ?? 0);
}

function pnlColor(val: number): string {
  const v = val ?? 0;
  if (v > 0) return "text-green-500";
  if (v < 0) return "text-red-500";
  return "text-muted-foreground";
}

function pnlSign(val: number): string {
  return (val ?? 0) >= 0 ? "+" : "";
}

function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m";
  return Math.floor(sec / 3600) + "h" + Math.floor((sec % 3600) / 60) + "m";
}

function shortMint(mint: string): string {
  if (!mint) return "";
  return mint.slice(0, 4) + ".." + mint.slice(-4);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[9px] px-1 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
      title={text}
    >
      {copied ? "copied" : shortMint(text)}
    </button>
  );
}

function TxLink({ tx }: { tx: string }) {
  if (!tx) return null;
  return (
    <a
      href={`https://solscan.io/tx/${tx}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[9px] text-blue-400 hover:text-blue-300"
      onClick={(e) => e.stopPropagation()}
    >
      tx
    </a>
  );
}

// --- Summary Tab ---
function SummaryTab({ snap }: { snap: Snapshot }) {
  const i = snap.ideal;
  const p = snap.pessimistic;
  return (
    <div className="space-y-2">
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
              {pnlSign(i.totalPnl)}{usd(i.totalPnl)} ({pnlSign(i.totalPnlPct)}{(i.totalPnlPct ?? 0).toFixed(1)}%)
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
            <span className="text-muted-foreground">Pessimistic (-{snap.slippagePct ?? snap.pessimisticPct}%)</span>
            <span className="font-bold">{usd(p.totalValueUsd)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">P&L</span>
            <span className={`font-bold ${pnlColor(p.totalPnl)}`}>
              {pnlSign(p.totalPnl)}{usd(p.totalPnl)} ({pnlSign(p.totalPnlPct)}{(p.totalPnlPct ?? 0).toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>cash: {usd(p.cashUsd)}</span>
            <span>open: {usd(p.openPositionValueUsd)}</span>
            <span>realized: <span className={pnlColor(p.realizedPnl)}>{pnlSign(p.realizedPnl)}{usd(p.realizedPnl)}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Positions Tab ---
function PositionsTab({ snap }: { snap: Snapshot }) {
  const ideal = snap.ideal.openPositions;
  const pess = snap.pessimistic;

  if (ideal.length === 0) {
    return <div className="text-[10px] text-muted-foreground py-2">No open positions</div>;
  }

  return (
    <div className="space-y-0.5 max-h-64 overflow-y-auto">
      <div className="grid grid-cols-[1fr_auto] gap-1 text-[9px] text-muted-foreground font-semibold border-b border-border pb-0.5 mb-0.5">
        <span>TOKEN</span>
        <span className="text-right">COST / NOW / PNL</span>
      </div>
      {ideal.map((pos) => {
        const pp = pess.openPositions.find((x) => x.mint === pos.mint);
        const hasLive = pos.livePriceTime && (Date.now() - pos.livePriceTime) < 300000;
        return (
          <div key={pos.mint} className="py-1 border-b border-border/50 last:border-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-bold">{pos.symbol}</span>
                <CopyButton text={pos.mint} />
                {hasLive && <span className="text-[8px] text-green-500/60">LIVE</span>}
              </div>
              <span className="text-muted-foreground">{timeAgo(pos.entryTime)}</span>
            </div>
            {/* Ideal row */}
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-[9px] text-blue-400">Ideal</span>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground">cost:{usd(pos.entryUsd)}</span>
                <span className="text-muted-foreground">now:{usd(pos.currentValueUsd)}</span>
                <span className={pnlColor(pos.unrealizedPnl)}>
                  {pnlSign(pos.unrealizedPnl)}{usd(pos.unrealizedPnl)} ({(pos.unrealizedPnlPct ?? 0).toFixed(1)}%)
                </span>
              </div>
            </div>
            {/* Pess row */}
            {pp && (
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-orange-400">Pess</span>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">cost:{usd(pp.entryUsd)}</span>
                  <span className="text-muted-foreground">now:{usd(pp.currentValueUsd)}</span>
                  <span className={pnlColor(pp.unrealizedPnl)}>
                    {pnlSign(pp.unrealizedPnl)}{usd(pp.unrealizedPnl)} ({(pp.unrealizedPnlPct ?? 0).toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Tokens Tab (grouped by token) ---
function TokensTab({ snap }: { snap: Snapshot }) {
  const groups = useMemo(() => {
    const map: Record<string, TokenGroup> = {};
    for (const t of snap.recentTrades) {
      if (!map[t.tokenMint]) {
        map[t.tokenMint] = {
          mint: t.tokenMint,
          symbol: t.tokenSymbol,
          name: t.tokenName,
          buys: [],
          sells: [],
          totalBuyUsd: 0,
          totalSellUsd: 0,
          idealRealizedPnl: 0,
          pessRealizedPnl: 0,
          openPosition: null,
          pessPosition: null,
          lastTradeTime: t.time,
          entryMc: null,
          exitMc: null,
        };
      }
      const g = map[t.tokenMint];
      if (t.type === "buy") {
        g.buys.push(t);
        g.totalBuyUsd += t.walletUsdVolume;
        if (!g.entryMc && t.mcUsd) g.entryMc = t.mcUsd;
      } else {
        g.sells.push(t);
        g.totalSellUsd += t.walletUsdVolume;
        if (t.mcUsd) g.exitMc = t.mcUsd;
      }
      const pnl = t.idealTradePnl ?? 0;
      const ppnl = t.pessTradePnl ?? 0;
      g.idealRealizedPnl += pnl;
      g.pessRealizedPnl += ppnl;
      if (t.time > g.lastTradeTime) g.lastTradeTime = t.time;
    }
    // Attach open positions
    for (const pos of snap.ideal.openPositions) {
      if (map[pos.mint]) map[pos.mint].openPosition = pos;
    }
    for (const pos of snap.pessimistic.openPositions) {
      if (map[pos.mint]) map[pos.mint].pessPosition = pos;
    }
    return Object.values(map).sort((a, b) => b.lastTradeTime - a.lastTradeTime);
  }, [snap]);

  const [expandedMint, setExpandedMint] = useState<string | null>(null);

  if (groups.length === 0) {
    return <div className="text-[10px] text-muted-foreground py-2">No trades yet</div>;
  }

  return (
    <div className="space-y-0.5 max-h-72 overflow-y-auto">
      {groups.map((g) => {
        const isOpen = !!g.openPosition;
        const totalIdealPnl = g.idealRealizedPnl + (g.openPosition?.unrealizedPnl ?? 0);
        const expanded = expandedMint === g.mint;
        return (
          <div key={g.mint} className="border-b border-border/50 last:border-0">
            {/* Token header row */}
            <button
              onClick={() => setExpandedMint(expanded ? null : g.mint)}
              className="w-full flex items-center justify-between py-1 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-[8px] font-bold px-1 rounded ${isOpen ? "bg-blue-500/15 text-blue-400" : "bg-muted text-muted-foreground"}`}>
                  {isOpen ? "OPEN" : "CLOSED"}
                </span>
                <span className="font-bold">{g.symbol}</span>
                <CopyButton text={g.mint} />
                <span className="text-[9px] text-muted-foreground">
                  {g.buys.length}B {g.sells.length}S
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                {g.entryMc && (
                  <span className="text-muted-foreground">MC:{usd(g.entryMc)}</span>
                )}
                <span className={pnlColor(totalIdealPnl)}>
                  {pnlSign(totalIdealPnl)}{usd(totalIdealPnl)}
                </span>
                <span className="text-muted-foreground text-[9px]">{timeAgo(g.lastTradeTime)}</span>
                <span className="text-[8px] text-muted-foreground">{expanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
              <div className="pl-2 pb-1.5 space-y-1">
                {/* Token info */}
                <div className="text-[10px] text-muted-foreground">{g.name}</div>

                {/* Position summary */}
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Bought: </span>
                    <span>{usd(g.totalBuyUsd)}</span>
                    {g.entryMc && <span className="text-muted-foreground ml-1">@ MC {usd(g.entryMc)}</span>}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sold: </span>
                    <span>{usd(g.totalSellUsd)}</span>
                    {g.exitMc && <span className="text-muted-foreground ml-1">@ MC {usd(g.exitMc)}</span>}
                  </div>
                </div>

                {/* Open position */}
                {g.openPosition && (
                  <div className="text-[10px] bg-blue-500/5 rounded px-1.5 py-0.5">
                    <div className="flex justify-between">
                      <span className="text-blue-400">Open Position (Ideal)</span>
                      <span className={pnlColor(g.openPosition.unrealizedPnl)}>
                        {pnlSign(g.openPosition.unrealizedPnl)}{usd(g.openPosition.unrealizedPnl)} ({(g.openPosition.unrealizedPnlPct ?? 0).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex gap-3 text-muted-foreground">
                      <span>cost:{usd(g.openPosition.entryUsd)}</span>
                      <span>now:{usd(g.openPosition.currentValueUsd)}</span>
                    </div>
                  </div>
                )}

                {/* PnL summary */}
                <div className="flex gap-4 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Ideal realized: </span>
                    <span className={pnlColor(g.idealRealizedPnl)}>{pnlSign(g.idealRealizedPnl)}{usd(g.idealRealizedPnl)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pess realized: </span>
                    <span className={pnlColor(g.pessRealizedPnl)}>{pnlSign(g.pessRealizedPnl)}{usd(g.pessRealizedPnl)}</span>
                  </div>
                </div>

                {/* Individual trades */}
                <div className="text-[9px] text-muted-foreground font-semibold">TRADES</div>
                <div className="space-y-0.5">
                  {[...g.buys, ...g.sells]
                    .sort((a, b) => b.time - a.time)
                    .map((t, idx) => (
                      <div key={t.originalTx || idx} className="flex items-center justify-between text-[10px] py-0.5 pl-1 border-l border-border">
                        <div className="flex items-center gap-1">
                          <span className={`font-bold px-1 rounded ${t.type === "buy" ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}>
                            {t.type === "buy" ? "BUY" : `SELL${t.sellPct != null ? ` ${((t.sellPct ?? 0) * 100).toFixed(0)}%` : ""}`}
                          </span>
                          <span className="text-muted-foreground">their:{usd(t.walletUsdVolume)}</span>
                          {t.mcUsd && <span className="text-muted-foreground">MC:{usd(t.mcUsd)}</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">imp:{(t.priceImpact ?? 0).toFixed(2)}%</span>
                          <span className="text-muted-foreground">fee:{usd(t.feeUsd)}</span>
                          {t.type === "sell" && (
                            <span className={pnlColor(t.idealTradePnl ?? t.idealPnl)}>
                              I:{pnlSign(t.idealTradePnl ?? t.idealPnl)}{usd(t.idealTradePnl ?? t.idealPnl)}
                            </span>
                          )}
                          {t.quoteLatencyMs != null && (
                            <span className="text-muted-foreground">{t.quoteLatencyMs}ms</span>
                          )}
                          <TxLink tx={t.originalTx} />
                          <span className="text-muted-foreground">{timeAgo(t.time)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Trades Tab (flat list, all details) ---
function TradesTab({ snap }: { snap: Snapshot }) {
  if (snap.recentTrades.length === 0) {
    return <div className="text-[10px] text-muted-foreground py-2">No trades yet</div>;
  }

  return (
    <div className="space-y-0.5 max-h-72 overflow-y-auto">
      {snap.recentTrades.map((t, idx) => (
        <div
          key={t.originalTx || idx}
          className="flex items-center justify-between text-[10px] py-0.5 border-b border-border/30 last:border-0"
        >
          <div className="flex items-center gap-1">
            <span
              className={`font-bold px-1 rounded ${
                t.type === "buy"
                  ? "bg-green-500/15 text-green-500"
                  : "bg-red-500/15 text-red-500"
              }`}
            >
              {t.type === "buy" ? "B" : `S${t.sellPct != null ? ` ${((t.sellPct ?? 0) * 100).toFixed(0)}%` : ""}`}
            </span>
            <span className="font-semibold">{t.tokenSymbol}</span>
            <CopyButton text={t.tokenMint} />
            <span className="text-muted-foreground">{usd(t.walletUsdVolume)}</span>
            {t.mcUsd && <span className="text-muted-foreground">MC:{usd(t.mcUsd)}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">imp:{(t.priceImpact ?? 0).toFixed(2)}%</span>
            <span className="text-muted-foreground">fee:{usd(t.feeUsd)}</span>
            <span className={pnlColor(t.idealTradePnl ?? t.idealPnl)}>
              I:{pnlSign(t.idealTradePnl ?? t.idealPnl)}{usd(t.idealTradePnl ?? t.idealPnl)}
            </span>
            <span className={pnlColor(t.pessTradePnl ?? t.pessPnl)}>
              P:{pnlSign(t.pessTradePnl ?? t.pessPnl)}{usd(t.pessTradePnl ?? t.pessPnl)}
            </span>
            <TxLink tx={t.originalTx} />
            <span className="text-muted-foreground">{timeAgo(t.time)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Main TraderCard ---
function TraderCard({ traderId }: { traderId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("summary");

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

    return () => {
      es.close();
    };
  }, [traderId]);

  if (!snap) {
    return (
      <div className="bg-card rounded-md px-3 py-2 text-xs text-muted-foreground">
        {traderId}: loading...
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "summary", label: "Summary" },
    { key: "positions", label: "Positions", count: snap.ideal.openPositions.length },
    { key: "tokens", label: "Tokens" },
    { key: "trades", label: "Trades", count: snap.tradeCount },
  ];

  const i = snap.ideal;

  return (
    <div className="bg-card rounded-md px-3 py-2 text-xs space-y-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{snap.walletLabel}</span>
          <span className={`font-bold ${pnlColor(i.totalPnl)}`}>
            {pnlSign(i.totalPnl)}{usd(i.totalPnl)} ({(i.totalPnlPct ?? 0).toFixed(1)}%)
          </span>
        </div>
        <span className="text-muted-foreground">
          fees:{usd(snap.totalFeesUsd)} | SOL {usd(snap.solPriceUsd)}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border pb-0.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-2 py-0.5 rounded-t text-[10px] font-medium transition-colors ${
              tab === t.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-0.5 text-[8px] opacity-60">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "summary" && <SummaryTab snap={snap} />}
      {tab === "positions" && <PositionsTab snap={snap} />}
      {tab === "tokens" && <TokensTab snap={snap} />}
      {tab === "trades" && <TradesTab snap={snap} />}
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
