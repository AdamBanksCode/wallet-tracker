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
  { id: "gake", label: "gake" },
  { id: "idontpaytaxes", label: "IDontPayTaxes" },
];

type Tab = "summary" | "positions" | "tokens" | "trades";

function f(v: number): string {
  const n = v ?? 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}

function $(v: number): string { return "$" + f(v ?? 0); }

function pc(v: number): string {
  const n = v ?? 0;
  return (n > 0 ? "text-green-500" : n < 0 ? "text-red-500" : "text-muted-foreground");
}

function ps(v: number): string { return (v ?? 0) >= 0 ? "+" : ""; }

function ago(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  return Math.floor(s / 3600) + "h" + Math.floor((s % 3600) / 60) + "m";
}

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1000); }}
      className="text-[9px] text-amber-500/60 hover:text-amber-500 transition-colors"
      title={text}
    >
      {c ? "COPIED" : text.slice(0, 4) + ".." + text.slice(-4)}
    </button>
  );
}

function TxLink({ tx }: { tx: string }) {
  if (!tx) return null;
  return (
    <a href={`https://solscan.io/tx/${tx}`} target="_blank" rel="noopener noreferrer"
       className="text-[9px] text-cyan-600 hover:text-cyan-400" onClick={(e) => e.stopPropagation()}>tx</a>
  );
}

// --- Summary ---
function SummaryTab({ snap }: { snap: Snapshot }) {
  const i = snap.ideal;
  const p = snap.pessimistic;

  const Row = ({ label, iv, pv, pnl }: { label: string; iv: string; pv: string; pnl?: [number, number] }) => (
    <div className="flex items-center text-[10px] border-b border-border/30 last:border-0">
      <span className="w-20 shrink-0 text-amber-500/80 py-[2px]">{label}</span>
      <span className={`flex-1 text-right tabular-nums py-[2px] ${pnl ? pc(pnl[0]) : ""}`}>{iv}</span>
      <span className={`flex-1 text-right tabular-nums py-[2px] ${pnl ? pc(pnl[1]) : ""}`}>{pv}</span>
    </div>
  );

  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase">
        <span className="w-20 shrink-0 py-[2px]">Metric</span>
        <span className="flex-1 text-right py-[2px]">Ideal</span>
        <span className="flex-1 text-right py-[2px]">Pessimistic</span>
      </div>
      <Row label="PORTFOLIO" iv={$(i.totalValueUsd)} pv={$(p.totalValueUsd)} />
      <Row label="TOTAL P&L" iv={`${ps(i.totalPnl)}${$(i.totalPnl)} (${(i.totalPnlPct ?? 0).toFixed(1)}%)`} pv={`${ps(p.totalPnl)}${$(p.totalPnl)} (${(p.totalPnlPct ?? 0).toFixed(1)}%)`} pnl={[i.totalPnl, p.totalPnl]} />
      <Row label="CASH" iv={$(i.cashUsd)} pv={$(p.cashUsd)} />
      <Row label="OPEN" iv={$(i.openPositionValueUsd)} pv={$(p.openPositionValueUsd)} />
      <Row label="REALIZED" iv={`${ps(i.realizedPnl)}${$(i.realizedPnl)}`} pv={`${ps(p.realizedPnl)}${$(p.realizedPnl)}`} pnl={[i.realizedPnl, p.realizedPnl]} />
    </div>
  );
}

// --- Positions ---
function PositionsTab({ snap }: { snap: Snapshot }) {
  const ideal = snap.ideal.openPositions;
  const pess = snap.pessimistic;

  if (ideal.length === 0) return <div className="text-[9px] text-muted-foreground py-2">NO OPEN POSITIONS</div>;

  return (
    <div className="max-h-48 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase sticky top-0 bg-card">
        <span className="w-16 shrink-0 py-[2px]">Token</span>
        <span className="w-20 shrink-0 py-[2px]">Contract</span>
        <span className="w-8 shrink-0 py-[2px]">Scn</span>
        <span className="flex-1 text-right py-[2px]">Cost</span>
        <span className="flex-1 text-right py-[2px]">Now</span>
        <span className="flex-1 text-right py-[2px]">P&L</span>
        <span className="w-10 text-right py-[2px]">Age</span>
      </div>
      {ideal.map((pos) => {
        const pp = pess.openPositions.find((x) => x.mint === pos.mint);
        const live = pos.livePriceTime && (Date.now() - pos.livePriceTime) < 300000;
        return (
          <div key={pos.mint}>
            {/* Ideal row */}
            <div className="flex items-center text-[10px] border-b border-border/30 hover:bg-[#141414] transition-colors">
              <span className="w-16 shrink-0 py-[2px] font-medium flex items-center gap-1">
                {pos.symbol}
                {live && <span className="w-1 h-1 bg-green-500 inline-block" />}
              </span>
              <span className="w-20 shrink-0 py-[2px]"><CopyBtn text={pos.mint} /></span>
              <span className="w-8 shrink-0 py-[2px] text-blue-400">IDL</span>
              <span className="flex-1 text-right tabular-nums py-[2px]">{$(pos.entryUsd)}</span>
              <span className="flex-1 text-right tabular-nums py-[2px]">{$(pos.currentValueUsd)}</span>
              <span className={`flex-1 text-right tabular-nums py-[2px] font-medium ${pc(pos.unrealizedPnl)}`}>
                {ps(pos.unrealizedPnl)}{$(pos.unrealizedPnl)} ({(pos.unrealizedPnlPct ?? 0).toFixed(1)}%)
              </span>
              <span className="w-10 text-right text-muted-foreground tabular-nums py-[2px]">{ago(pos.entryTime)}</span>
            </div>
            {/* Pess row */}
            {pp && (
              <div className="flex items-center text-[10px] border-b border-border/30 hover:bg-[#141414] transition-colors">
                <span className="w-16 shrink-0 py-[2px]" />
                <span className="w-20 shrink-0 py-[2px]" />
                <span className="w-8 shrink-0 py-[2px] text-orange-400">PSS</span>
                <span className="flex-1 text-right tabular-nums py-[2px]">{$(pp.entryUsd)}</span>
                <span className="flex-1 text-right tabular-nums py-[2px]">{$(pp.currentValueUsd)}</span>
                <span className={`flex-1 text-right tabular-nums py-[2px] font-medium ${pc(pp.unrealizedPnl)}`}>
                  {ps(pp.unrealizedPnl)}{$(pp.unrealizedPnl)} ({(pp.unrealizedPnlPct ?? 0).toFixed(1)}%)
                </span>
                <span className="w-10 shrink-0 py-[2px]" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Tokens ---
function TokensTab({ snap }: { snap: Snapshot }) {
  const groups = useMemo(() => {
    const map: Record<string, TokenGroup> = {};
    for (const t of snap.recentTrades) {
      if (!map[t.tokenMint]) {
        map[t.tokenMint] = { mint: t.tokenMint, symbol: t.tokenSymbol, name: t.tokenName, buys: [], sells: [], totalBuyUsd: 0, totalSellUsd: 0, idealRealizedPnl: 0, pessRealizedPnl: 0, openPosition: null, pessPosition: null, lastTradeTime: t.time, entryMc: null, exitMc: null };
      }
      const g = map[t.tokenMint];
      if (t.type === "buy") { g.buys.push(t); g.totalBuyUsd += t.walletUsdVolume; if (!g.entryMc && t.mcUsd) g.entryMc = t.mcUsd; }
      else { g.sells.push(t); g.totalSellUsd += t.walletUsdVolume; if (t.mcUsd) g.exitMc = t.mcUsd; }
      g.idealRealizedPnl += t.idealTradePnl ?? 0;
      g.pessRealizedPnl += t.pessTradePnl ?? 0;
      if (t.time > g.lastTradeTime) g.lastTradeTime = t.time;
    }
    for (const pos of snap.ideal.openPositions) { if (map[pos.mint]) map[pos.mint].openPosition = pos; }
    for (const pos of snap.pessimistic.openPositions) { if (map[pos.mint]) map[pos.mint].pessPosition = pos; }
    return Object.values(map).sort((a, b) => b.lastTradeTime - a.lastTradeTime);
  }, [snap]);

  const [exp, setExp] = useState<string | null>(null);

  if (groups.length === 0) return <div className="text-[9px] text-muted-foreground py-2">NO TRADES YET</div>;

  return (
    <div className="max-h-56 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase sticky top-0 bg-card">
        <span className="w-12 shrink-0 py-[2px]">Status</span>
        <span className="w-16 shrink-0 py-[2px]">Token</span>
        <span className="w-20 shrink-0 py-[2px]">Contract</span>
        <span className="w-12 shrink-0 text-right py-[2px]">Trades</span>
        <span className="flex-1 text-right py-[2px]">Entry MC</span>
        <span className="flex-1 text-right py-[2px]">Bought</span>
        <span className="flex-1 text-right py-[2px]">Sold</span>
        <span className="flex-1 text-right py-[2px]">Ideal P&L</span>
        <span className="w-10 text-right py-[2px]">Age</span>
      </div>
      {groups.map((g) => {
        const isOpen = !!g.openPosition;
        const totalPnl = g.idealRealizedPnl + (g.openPosition?.unrealizedPnl ?? 0);
        const expanded = exp === g.mint;
        return (
          <div key={g.mint}>
            <button
              onClick={() => setExp(expanded ? null : g.mint)}
              className="w-full flex items-center text-[10px] border-b border-border/30 hover:bg-[#141414] transition-colors"
            >
              <span className={`w-12 shrink-0 py-[2px] font-bold ${isOpen ? "text-blue-400" : "text-muted-foreground"}`}>
                {isOpen ? "OPEN" : "CLSD"}
              </span>
              <span className="w-16 shrink-0 py-[2px] font-medium text-left">{g.symbol}</span>
              <span className="w-20 shrink-0 py-[2px] text-left"><CopyBtn text={g.mint} /></span>
              <span className="w-12 shrink-0 text-right py-[2px] text-muted-foreground tabular-nums">{g.buys.length}B/{g.sells.length}S</span>
              <span className="flex-1 text-right py-[2px] text-muted-foreground tabular-nums">{g.entryMc ? $(g.entryMc) : "-"}</span>
              <span className="flex-1 text-right py-[2px] tabular-nums">{$(g.totalBuyUsd)}</span>
              <span className="flex-1 text-right py-[2px] tabular-nums">{$(g.totalSellUsd)}</span>
              <span className={`flex-1 text-right py-[2px] tabular-nums font-medium ${pc(totalPnl)}`}>{ps(totalPnl)}{$(totalPnl)}</span>
              <span className="w-10 text-right py-[2px] text-muted-foreground tabular-nums">{ago(g.lastTradeTime)}</span>
            </button>

            {expanded && (
              <div className="bg-[#0c0c0c] border-b border-border/50">
                {/* Token name + PnL breakdown */}
                <div className="px-2 py-1 flex items-center gap-4 text-[9px] text-muted-foreground border-b border-border/30">
                  <span>{g.name}</span>
                  <span>Ideal realized: <span className={pc(g.idealRealizedPnl)}>{ps(g.idealRealizedPnl)}{$(g.idealRealizedPnl)}</span></span>
                  <span>Pess realized: <span className={pc(g.pessRealizedPnl)}>{ps(g.pessRealizedPnl)}{$(g.pessRealizedPnl)}</span></span>
                  {g.exitMc && <span>Exit MC: {$(g.exitMc)}</span>}
                </div>

                {/* Open position */}
                {g.openPosition && (
                  <div className="px-2 py-1 flex items-center gap-4 text-[9px] border-b border-border/30">
                    <span className="text-blue-400">OPEN POS</span>
                    <span className="text-muted-foreground">cost:{$(g.openPosition.entryUsd)}</span>
                    <span className="text-muted-foreground">now:{$(g.openPosition.currentValueUsd)}</span>
                    <span className={pc(g.openPosition.unrealizedPnl)}>
                      {ps(g.openPosition.unrealizedPnl)}{$(g.openPosition.unrealizedPnl)} ({(g.openPosition.unrealizedPnlPct ?? 0).toFixed(1)}%)
                    </span>
                  </div>
                )}

                {/* Trade rows */}
                <div className="text-[9px]">
                  {[...g.buys, ...g.sells].sort((a, b) => b.time - a.time).map((t, idx) => (
                    <div key={t.originalTx || idx} className="flex items-center px-2 py-[2px] border-b border-border/20 hover:bg-[#141414]">
                      <span className={`w-14 shrink-0 font-bold ${t.type === "buy" ? "text-green-500" : "text-red-500"}`}>
                        {t.type === "buy" ? "BUY" : `SELL${t.sellPct != null ? " " + ((t.sellPct ?? 0) * 100).toFixed(0) + "%" : ""}`}
                      </span>
                      <span className="w-16 shrink-0 text-muted-foreground tabular-nums">vol:{$(t.walletUsdVolume)}</span>
                      <span className="w-16 shrink-0 text-muted-foreground tabular-nums">{t.mcUsd ? "MC:" + $(t.mcUsd) : ""}</span>
                      <span className="w-16 shrink-0 text-muted-foreground tabular-nums">imp:{(t.priceImpact ?? 0).toFixed(2)}%</span>
                      <span className="w-14 shrink-0 text-muted-foreground tabular-nums">fee:{$(t.feeUsd)}</span>
                      {t.type === "sell" && (
                        <span className={`w-20 shrink-0 tabular-nums ${pc(t.idealTradePnl ?? t.idealPnl)}`}>
                          I:{ps(t.idealTradePnl ?? t.idealPnl)}{$(t.idealTradePnl ?? t.idealPnl)}
                        </span>
                      )}
                      {t.type === "buy" && <span className="w-20 shrink-0" />}
                      {t.quoteLatencyMs != null && <span className="text-muted-foreground mr-2">{t.quoteLatencyMs}ms</span>}
                      <span className="ml-auto flex items-center gap-2">
                        <TxLink tx={t.originalTx} />
                        <span className="text-muted-foreground tabular-nums">{ago(t.time)}</span>
                      </span>
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

// --- Trades (flat) ---
function TradesTab({ snap }: { snap: Snapshot }) {
  if (snap.recentTrades.length === 0) return <div className="text-[9px] text-muted-foreground py-2">NO TRADES YET</div>;

  return (
    <div className="max-h-56 overflow-y-auto">
      <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase sticky top-0 bg-card">
        <span className="w-7 shrink-0 py-[2px]">Side</span>
        <span className="w-16 shrink-0 py-[2px]">Token</span>
        <span className="w-20 shrink-0 py-[2px]">Contract</span>
        <span className="flex-1 text-right py-[2px]">Vol</span>
        <span className="flex-1 text-right py-[2px]">MC</span>
        <span className="w-12 text-right py-[2px]">Imp%</span>
        <span className="w-12 text-right py-[2px]">Fee</span>
        <span className="flex-1 text-right py-[2px]">Ideal</span>
        <span className="flex-1 text-right py-[2px]">Pess</span>
        <span className="w-6 text-right py-[2px]">Tx</span>
        <span className="w-10 text-right py-[2px]">Age</span>
      </div>
      {snap.recentTrades.map((t, idx) => (
        <div key={t.originalTx || idx} className="flex items-center text-[10px] border-b border-border/30 hover:bg-[#141414] transition-colors">
          <span className={`w-7 shrink-0 py-[2px] font-bold ${t.type === "buy" ? "text-green-500" : "text-red-500"}`}>
            {t.type === "buy" ? "B" : "S"}
          </span>
          <span className="w-16 shrink-0 py-[2px] font-medium">{t.tokenSymbol}</span>
          <span className="w-20 shrink-0 py-[2px]"><CopyBtn text={t.tokenMint} /></span>
          <span className="flex-1 text-right tabular-nums py-[2px]">{$(t.walletUsdVolume)}</span>
          <span className="flex-1 text-right tabular-nums py-[2px] text-muted-foreground">{t.mcUsd ? $(t.mcUsd) : "-"}</span>
          <span className="w-12 text-right tabular-nums py-[2px] text-muted-foreground">{(t.priceImpact ?? 0).toFixed(2)}%</span>
          <span className="w-12 text-right tabular-nums py-[2px] text-muted-foreground">{$(t.feeUsd)}</span>
          <span className={`flex-1 text-right tabular-nums py-[2px] ${pc(t.idealTradePnl ?? t.idealPnl)}`}>
            {ps(t.idealTradePnl ?? t.idealPnl)}{$(t.idealTradePnl ?? t.idealPnl)}
          </span>
          <span className={`flex-1 text-right tabular-nums py-[2px] ${pc(t.pessTradePnl ?? t.pessPnl)}`}>
            {ps(t.pessTradePnl ?? t.pessPnl)}{$(t.pessTradePnl ?? t.pessPnl)}
          </span>
          <span className="w-6 text-right py-[2px]"><TxLink tx={t.originalTx} /></span>
          <span className="w-10 text-right text-muted-foreground tabular-nums py-[2px]">{ago(t.time)}</span>
        </div>
      ))}
    </div>
  );
}

// --- Trader Panel ---
function TraderPanel({ traderId }: { traderId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("summary");

  useEffect(() => {
    fetch(`/api/paper/${traderId}/snapshot`).then((r) => r.json()).then(setSnap).catch(() => {});
    const es = new EventSource(`/api/paper/${traderId}/stream`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "snapshot" || data.type === "trade") setSnap(data.type === "trade" ? data.state : data);
      } catch {}
    };
    return () => es.close();
  }, [traderId]);

  if (!snap) {
    return (
      <div className="flex-1 border-r border-border last:border-r-0 px-2 py-1 text-[9px] text-muted-foreground">
        {traderId}: LOADING...
      </div>
    );
  }

  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "summary", label: "SUM" },
    { key: "positions", label: "POS", n: snap.ideal.openPositions.length },
    { key: "tokens", label: "TKN" },
    { key: "trades", label: "TRD", n: snap.tradeCount },
  ];

  const i = snap.ideal;
  const slipLabel = snap.slippageMode === "dynamic" ? "dyn" : `${snap.slippagePct ?? snap.pessimisticPct}%`;

  return (
    <div className="flex-1 border-r border-border last:border-r-0 flex flex-col min-w-0">
      {/* Panel header */}
      <div className="flex items-center justify-between px-2 py-[3px] border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 font-bold text-[10px]">{snap.walletLabel.toUpperCase()}</span>
          <span className={`font-bold text-[10px] tabular-nums ${pc(i.totalPnl)}`}>
            {ps(i.totalPnl)}{$(i.totalPnl)} ({(i.totalPnlPct ?? 0).toFixed(1)}%)
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground tabular-nums">
          <span>fee:{$(snap.totalFeesUsd)}</span>
          <span>slip:{slipLabel}</span>
          <span>SOL:{$(snap.solPriceUsd)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-2 py-[3px] text-[9px] font-medium transition-colors border-r border-border last:border-r-0 ${
              tab === t.key
                ? "bg-amber-500/10 text-amber-500"
                : "text-muted-foreground hover:text-foreground hover:bg-[#141414]"
            }`}
          >
            {t.label}{t.n != null && t.n > 0 ? ` ${t.n}` : ""}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
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
    <div className="shrink-0">
      {/* Section header */}
      <div className="flex items-center px-2 py-0.5 border-b border-border bg-card">
        <span className="text-[9px] text-amber-500 font-bold">PAPER TRADING</span>
        <span className="text-[9px] text-muted-foreground ml-2">$2K / $200 max</span>
      </div>
      {/* Two panels side by side */}
      <div className="flex border-b border-border">
        {TRADERS.map((t) => (
          <TraderPanel key={t.id} traderId={t.id} />
        ))}
      </div>
    </div>
  );
}
