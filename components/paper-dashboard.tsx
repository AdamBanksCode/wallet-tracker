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
  slippageMode?: string;
  ideal: ScenarioData;
  pessimistic: ScenarioData;
  recentTrades: Trade[];
}

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
  { id: "gake", label: "gake", accent: "violet" },
  { id: "idontpaytaxes", label: "IDontPayTaxes", accent: "cyan" },
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

function pnlBg(val: number): string {
  const v = val ?? 0;
  if (v > 0) return "bg-green-500/10";
  if (v < 0) return "bg-red-500/10";
  return "bg-muted/30";
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
      className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-all border border-transparent hover:border-border"
      title={text}
    >
      {copied ? "copied!" : shortMint(text)}
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
      className="text-[9px] text-blue-400/80 hover:text-blue-400 transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      tx
    </a>
  );
}

// --- Stat Card (for summary) ---
function StatRow({ label, value, sub, pnl }: { label: string; value: string; sub?: string; pnl?: number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`font-semibold tabular-nums ${pnl != null ? pnlColor(pnl) : ""}`}>{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground tabular-nums">{sub}</span>}
      </div>
    </div>
  );
}

// --- Summary Tab ---
function SummaryTab({ snap }: { snap: Snapshot }) {
  const i = snap.ideal;
  const p = snap.pessimistic;
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Ideal */}
      <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-3 space-y-0.5">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Ideal</span>
        </div>
        <StatRow label="Portfolio" value={usd(i.totalValueUsd)} />
        <StatRow
          label="Total P&L"
          value={`${pnlSign(i.totalPnl)}${usd(i.totalPnl)}`}
          sub={`${pnlSign(i.totalPnlPct)}${(i.totalPnlPct ?? 0).toFixed(1)}%`}
          pnl={i.totalPnl}
        />
        <div className="border-t border-border/50 mt-1.5 pt-1.5">
          <StatRow label="Cash" value={usd(i.cashUsd)} />
          <StatRow label="Open" value={usd(i.openPositionValueUsd)} />
          <StatRow
            label="Realized"
            value={`${pnlSign(i.realizedPnl)}${usd(i.realizedPnl)}`}
            pnl={i.realizedPnl}
          />
        </div>
      </div>
      {/* Pessimistic */}
      <div className="rounded-lg bg-orange-500/5 border border-orange-500/10 p-3 space-y-0.5">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider">
            Pessimistic {snap.slippageMode === "dynamic" ? "(dynamic)" : `(-${snap.slippagePct ?? snap.pessimisticPct}%)`}
          </span>
        </div>
        <StatRow label="Portfolio" value={usd(p.totalValueUsd)} />
        <StatRow
          label="Total P&L"
          value={`${pnlSign(p.totalPnl)}${usd(p.totalPnl)}`}
          sub={`${pnlSign(p.totalPnlPct)}${(p.totalPnlPct ?? 0).toFixed(1)}%`}
          pnl={p.totalPnl}
        />
        <div className="border-t border-border/50 mt-1.5 pt-1.5">
          <StatRow label="Cash" value={usd(p.cashUsd)} />
          <StatRow label="Open" value={usd(p.openPositionValueUsd)} />
          <StatRow
            label="Realized"
            value={`${pnlSign(p.realizedPnl)}${usd(p.realizedPnl)}`}
            pnl={p.realizedPnl}
          />
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
    return <div className="text-[10px] text-muted-foreground py-4 text-center">No open positions</div>;
  }

  return (
    <div className="space-y-1 max-h-72 overflow-y-auto">
      {ideal.map((pos) => {
        const pp = pess.openPositions.find((x) => x.mint === pos.mint);
        const hasLive = pos.livePriceTime && (Date.now() - pos.livePriceTime) < 300000;
        return (
          <div key={pos.mint} className="rounded-lg border border-border/50 p-2.5 hover:border-border transition-colors">
            {/* Header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-bold">{pos.symbol}</span>
                <CopyButton text={pos.mint} />
                {hasLive && (
                  <span className="text-[8px] text-green-500/80 flex items-center gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-green-500 inline-block shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                    LIVE
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">{timeAgo(pos.entryTime)}</span>
            </div>
            {/* Ideal row */}
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-blue-500 inline-block" />
                <span className="text-blue-400 text-[9px]">Ideal</span>
              </div>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="text-muted-foreground">cost {usd(pos.entryUsd)}</span>
                <span className="text-muted-foreground">now {usd(pos.currentValueUsd)}</span>
                <span className={`font-medium ${pnlColor(pos.unrealizedPnl)}`}>
                  {pnlSign(pos.unrealizedPnl)}{usd(pos.unrealizedPnl)}
                  <span className="opacity-70 ml-0.5">({(pos.unrealizedPnlPct ?? 0).toFixed(1)}%)</span>
                </span>
              </div>
            </div>
            {/* Pess row */}
            {pp && (
              <div className="flex items-center justify-between text-[10px] mt-0.5">
                <div className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-orange-500 inline-block" />
                  <span className="text-orange-400 text-[9px]">Pess</span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-muted-foreground">cost {usd(pp.entryUsd)}</span>
                  <span className="text-muted-foreground">now {usd(pp.currentValueUsd)}</span>
                  <span className={`font-medium ${pnlColor(pp.unrealizedPnl)}`}>
                    {pnlSign(pp.unrealizedPnl)}{usd(pp.unrealizedPnl)}
                    <span className="opacity-70 ml-0.5">({(pp.unrealizedPnlPct ?? 0).toFixed(1)}%)</span>
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
      g.idealRealizedPnl += t.idealTradePnl ?? 0;
      g.pessRealizedPnl += t.pessTradePnl ?? 0;
      if (t.time > g.lastTradeTime) g.lastTradeTime = t.time;
    }
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
    return <div className="text-[10px] text-muted-foreground py-4 text-center">No trades yet</div>;
  }

  return (
    <div className="space-y-1 max-h-80 overflow-y-auto">
      {groups.map((g) => {
        const isOpen = !!g.openPosition;
        const totalIdealPnl = g.idealRealizedPnl + (g.openPosition?.unrealizedPnl ?? 0);
        const expanded = expandedMint === g.mint;
        return (
          <div key={g.mint} className={`rounded-lg border transition-colors ${expanded ? "border-border bg-muted/20" : "border-border/50 hover:border-border"}`}>
            {/* Token header row */}
            <button
              onClick={() => setExpandedMint(expanded ? null : g.mint)}
              className="w-full flex items-center justify-between px-2.5 py-2 text-left"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                    isOpen
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isOpen ? "OPEN" : "CLOSED"}
                </span>
                <span className="font-bold">{g.symbol}</span>
                <CopyButton text={g.mint} />
                <span className="text-[9px] text-muted-foreground">
                  {g.buys.length}B / {g.sells.length}S
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                {g.entryMc && (
                  <span className="text-muted-foreground tabular-nums">MC {usd(g.entryMc)}</span>
                )}
                <span className={`font-semibold tabular-nums ${pnlColor(totalIdealPnl)}`}>
                  {pnlSign(totalIdealPnl)}{usd(totalIdealPnl)}
                </span>
                <span className="text-muted-foreground text-[9px] tabular-nums">{timeAgo(g.lastTradeTime)}</span>
                <span className="text-[8px] text-muted-foreground w-3">{expanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* Expanded detail */}
            {expanded && (
              <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/50">
                {/* Token info */}
                <div className="text-[10px] text-muted-foreground pt-2">{g.name}</div>

                {/* Position summary */}
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="text-green-500/80">Bought:</span>
                    <span className="tabular-nums">{usd(g.totalBuyUsd)}</span>
                    {g.entryMc && <span className="text-muted-foreground">@ MC {usd(g.entryMc)}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-500/80">Sold:</span>
                    <span className="tabular-nums">{usd(g.totalSellUsd)}</span>
                    {g.exitMc && <span className="text-muted-foreground">@ MC {usd(g.exitMc)}</span>}
                  </div>
                </div>

                {/* Open position */}
                {g.openPosition && (
                  <div className="rounded-md bg-blue-500/5 border border-blue-500/10 px-2.5 py-1.5 text-[10px]">
                    <div className="flex justify-between">
                      <div className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-blue-500 inline-block" />
                        <span className="text-blue-400">Open Position (Ideal)</span>
                      </div>
                      <span className={`font-medium tabular-nums ${pnlColor(g.openPosition.unrealizedPnl)}`}>
                        {pnlSign(g.openPosition.unrealizedPnl)}{usd(g.openPosition.unrealizedPnl)} ({(g.openPosition.unrealizedPnlPct ?? 0).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex gap-3 text-muted-foreground mt-0.5 tabular-nums">
                      <span>cost {usd(g.openPosition.entryUsd)}</span>
                      <span>now {usd(g.openPosition.currentValueUsd)}</span>
                    </div>
                  </div>
                )}

                {/* PnL summary */}
                <div className="flex gap-4 text-[10px]">
                  <div>
                    <span className="text-muted-foreground">Ideal realized: </span>
                    <span className={`tabular-nums ${pnlColor(g.idealRealizedPnl)}`}>{pnlSign(g.idealRealizedPnl)}{usd(g.idealRealizedPnl)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pess realized: </span>
                    <span className={`tabular-nums ${pnlColor(g.pessRealizedPnl)}`}>{pnlSign(g.pessRealizedPnl)}{usd(g.pessRealizedPnl)}</span>
                  </div>
                </div>

                {/* Individual trades */}
                <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Trades</div>
                <div className="space-y-0.5">
                  {[...g.buys, ...g.sells]
                    .sort((a, b) => b.time - a.time)
                    .map((t, idx) => (
                      <div key={t.originalTx || idx} className="flex items-center justify-between text-[10px] py-1 px-1.5 rounded hover:bg-muted/30 transition-colors border-l-2 border-border/50">
                        <div className="flex items-center gap-1">
                          <span className={`font-bold px-1 rounded ${t.type === "buy" ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}>
                            {t.type === "buy" ? "BUY" : `SELL${t.sellPct != null ? ` ${((t.sellPct ?? 0) * 100).toFixed(0)}%` : ""}`}
                          </span>
                          <span className="text-muted-foreground tabular-nums">vol {usd(t.walletUsdVolume)}</span>
                          {t.mcUsd && <span className="text-muted-foreground tabular-nums">MC {usd(t.mcUsd)}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 tabular-nums">
                          <span className="text-muted-foreground">imp {(t.priceImpact ?? 0).toFixed(2)}%</span>
                          <span className="text-muted-foreground">fee {usd(t.feeUsd)}</span>
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

// --- Trades Tab (flat list) ---
function TradesTab({ snap }: { snap: Snapshot }) {
  if (snap.recentTrades.length === 0) {
    return <div className="text-[10px] text-muted-foreground py-4 text-center">No trades yet</div>;
  }

  return (
    <div className="space-y-0.5 max-h-80 overflow-y-auto">
      {snap.recentTrades.map((t, idx) => (
        <div
          key={t.originalTx || idx}
          className="flex items-center justify-between text-[10px] py-1.5 px-1.5 rounded hover:bg-muted/30 transition-colors border-b border-border/30 last:border-0"
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
            <span className="text-muted-foreground tabular-nums">{usd(t.walletUsdVolume)}</span>
            {t.mcUsd && <span className="text-muted-foreground tabular-nums">MC {usd(t.mcUsd)}</span>}
          </div>
          <div className="flex items-center gap-1.5 tabular-nums">
            <span className="text-muted-foreground">imp {(t.priceImpact ?? 0).toFixed(2)}%</span>
            <span className="text-muted-foreground">fee {usd(t.feeUsd)}</span>
            <span className={`font-medium ${pnlColor(t.idealTradePnl ?? t.idealPnl)}`}>
              I:{pnlSign(t.idealTradePnl ?? t.idealPnl)}{usd(t.idealTradePnl ?? t.idealPnl)}
            </span>
            <span className={`font-medium ${pnlColor(t.pessTradePnl ?? t.pessPnl)}`}>
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
function TraderCard({ traderId, accent }: { traderId: string; accent: string }) {
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
      <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground animate-pulse">
        Loading {traderId}...
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
  const accentBorder = accent === "violet" ? "border-violet-500/30" : "border-cyan-500/30";
  const accentDot = accent === "violet" ? "bg-violet-500" : "bg-cyan-500";
  const accentText = accent === "violet" ? "text-violet-400" : "text-cyan-400";

  return (
    <div className={`rounded-lg border bg-card text-xs overflow-hidden ${accentBorder}`}>
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${accentDot}`} />
          <span className={`font-bold text-sm ${accentText}`}>{snap.walletLabel}</span>
          <span className={`font-bold tabular-nums ${pnlColor(i.totalPnl)} ${pnlBg(i.totalPnl)} px-1.5 py-0.5 rounded`}>
            {pnlSign(i.totalPnl)}{usd(i.totalPnl)}
            <span className="opacity-70 ml-0.5">({(i.totalPnlPct ?? 0).toFixed(1)}%)</span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
          <span>fees {usd(snap.totalFeesUsd)}</span>
          <span className="text-border">|</span>
          <span>SOL {usd(snap.solPriceUsd)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3.5 pt-2 flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-2.5 py-1 rounded-t-md text-[10px] font-medium transition-all ${
              tab === t.key
                ? "bg-muted text-foreground border-b-2 border-foreground/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1 text-[8px] bg-muted-foreground/20 px-1 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-3.5 py-2.5">
        {tab === "summary" && <SummaryTab snap={snap} />}
        {tab === "positions" && <PositionsTab snap={snap} />}
        {tab === "tokens" && <TokensTab snap={snap} />}
        {tab === "trades" && <TradesTab snap={snap} />}
      </div>
    </div>
  );
}

export default function PaperDashboard() {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Paper Trading
        </h2>
        <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
          $2K start / $200 max
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="space-y-3">
        {TRADERS.map((t) => (
          <TraderCard key={t.id} traderId={t.id} accent={t.accent} />
        ))}
      </div>
    </section>
  );
}
