"use client";

import { useEffect, useState } from "react";

interface Position {
  mint: string; symbol: string; name: string; tokens: number;
  avgEntryPrice: number; entryUsd: number; entryTime: number;
  currentValueUsd: number; unrealizedPnl: number; unrealizedPnlPct: number;
  livePrice?: number; livePriceTime?: number;
}
interface ScenarioData {
  cashUsd: number; openPositionValueUsd: number; totalValueUsd: number;
  realizedPnl: number; realizedPnlPct: number; totalPnl: number; totalPnlPct: number;
  openPositions: Position[];
}
interface Trade {
  time: number; type: string; tokenMint: string; tokenSymbol: string; tokenName: string;
  walletSolAmount: number; walletTokenAmount: number; walletUsdVolume: number;
  mcUsd: number | null; quotedPriceUsd: number; priceImpact: number; feeUsd: number;
  sellPct: number | null; idealTradePnl: number; pessTradePnl: number;
  idealBalance: number; idealPnl: number; pessBalance: number; pessPnl: number;
  hadQuote: boolean; originalTx: string; quoteLatencyMs?: number;
}
interface Snapshot {
  walletLabel: string; wallet: string; startedAt: number; startingBalanceUsd: number;
  solPriceUsd: number; tradeCount: number; totalFeesUsd: number;
  pessimisticPct?: number; slippagePct?: number; slippageMode?: string;
  ideal: ScenarioData; pessimistic: ScenarioData; recentTrades: Trade[];
}

const TRADERS = [
  { id: "gake", label: "gake" },
  { id: "idontpaytaxes", label: "IDPT" },
  { id: "thedoc", label: "TheDoc" },
];

function f(v: number): string { const n = v ?? 0; if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K"; return n.toFixed(2); }
function $(v: number): string { return "$" + f(v ?? 0); }
function pc(v: number): string { const n = v ?? 0; return n > 0 ? "text-green-600 dark:text-green-500" : n < 0 ? "text-red-600 dark:text-red-500" : "text-muted-foreground"; }
function ps(v: number): string { return (v ?? 0) >= 0 ? "+" : ""; }
function ago(ms: number): string { const s = Math.floor((Date.now() - ms) / 1000); if (s < 60) return s + "s"; if (s < 3600) return Math.floor(s / 60) + "m"; return Math.floor(s / 3600) + "h" + Math.floor((s % 3600) / 60) + "m"; }

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false);
  return (
    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1000); }}
      className="text-[10px] text-amber-600/60 dark:text-amber-500/60 hover:text-amber-600 dark:hover:text-amber-500 transition-colors" title={text}>
      {c ? "COPIED" : text.slice(0, 4) + ".." + text.slice(-4)}
    </button>
  );
}

function TxLink({ tx }: { tx: string }) {
  if (!tx) return null;
  return <a href={`https://solscan.io/tx/${tx}`} target="_blank" rel="noopener noreferrer"
    className="text-[10px] text-blue-600 dark:text-cyan-500 hover:text-blue-500 dark:hover:text-cyan-400" onClick={(e) => e.stopPropagation()}>tx</a>;
}

function SummaryTab({ snap }: { snap: Snapshot }) {
  const i = snap.ideal, p = snap.pessimistic;
  const Row = ({ label, iv, pv, pnl }: { label: string; iv: string; pv: string; pnl?: [number, number] }) => (
    <div className="flex items-center text-[11px] border-b border-border/30 last:border-0">
      <span className="w-24 shrink-0 text-amber-600 dark:text-amber-500/80 py-1 font-medium">{label}</span>
      <span className={`flex-1 text-right tabular-nums py-1 ${pnl ? pc(pnl[0]) : ""}`}>{iv}</span>
      <span className={`flex-1 text-right tabular-nums py-1 ${pnl ? pc(pnl[1]) : ""}`}>{pv}</span>
    </div>
  );
  return (
    <div className="p-3">
      <div className="flex items-center text-[10px] text-muted-foreground border-b border-border uppercase font-medium">
        <span className="w-24 shrink-0 py-1">Metric</span>
        <span className="flex-1 text-right py-1">Ideal</span>
        <span className="flex-1 text-right py-1">Pessimistic</span>
      </div>
      <Row label="PORTFOLIO" iv={$(i.totalValueUsd)} pv={$(p.totalValueUsd)} />
      <Row label="TOTAL P&L" iv={`${ps(i.totalPnl)}${$(i.totalPnl)} (${(i.totalPnlPct ?? 0).toFixed(1)}%)`} pv={`${ps(p.totalPnl)}${$(p.totalPnl)} (${(p.totalPnlPct ?? 0).toFixed(1)}%)`} pnl={[i.totalPnl, p.totalPnl]} />
      <Row label="CASH" iv={$(i.cashUsd)} pv={$(p.cashUsd)} />
      <Row label="OPEN" iv={$(i.openPositionValueUsd)} pv={$(p.openPositionValueUsd)} />
      <Row label="REALIZED" iv={`${ps(i.realizedPnl)}${$(i.realizedPnl)}`} pv={`${ps(p.realizedPnl)}${$(p.realizedPnl)}`} pnl={[i.realizedPnl, p.realizedPnl]} />
    </div>
  );
}

function PositionsTab({ snap }: { snap: Snapshot }) {
  const ideal = snap.ideal.openPositions, pess = snap.pessimistic;
  if (ideal.length === 0) return <div className="text-xs text-muted-foreground py-6 text-center">No open positions</div>;
  return (
    <div className="overflow-y-auto" style={{ maxHeight: "calc(100% - 4px)" }}>
      <div className="flex items-center text-[10px] text-muted-foreground border-b border-border uppercase font-medium px-3 sticky top-0 bg-card">
        <span className="w-16 shrink-0 py-1">Token</span>
        <span className="w-20 shrink-0 py-1">Contract</span>
        <span className="w-10 shrink-0 py-1">Scn</span>
        <span className="flex-1 text-right py-1">Cost</span>
        <span className="flex-1 text-right py-1">Now</span>
        <span className="flex-1 text-right py-1">P&L</span>
        <span className="w-10 text-right py-1">Age</span>
      </div>
      {ideal.map((pos) => {
        const pp = pess.openPositions.find((x) => x.mint === pos.mint);
        const live = pos.livePriceTime && (Date.now() - pos.livePriceTime) < 300000;
        return (
          <div key={pos.mint}>
            <div className="flex items-center text-[11px] border-b border-border/30 hover:bg-muted/50 px-3">
              <span className="w-16 shrink-0 py-1 font-medium flex items-center gap-1">{pos.symbol}{live && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}</span>
              <span className="w-20 shrink-0 py-1"><CopyBtn text={pos.mint} /></span>
              <span className="w-10 shrink-0 py-1 text-blue-600 dark:text-blue-400">IDL</span>
              <span className="flex-1 text-right tabular-nums py-1">{$(pos.entryUsd)}</span>
              <span className="flex-1 text-right tabular-nums py-1">{$(pos.currentValueUsd)}</span>
              <span className={`flex-1 text-right tabular-nums py-1 font-medium ${pc(pos.unrealizedPnl)}`}>{ps(pos.unrealizedPnl)}{$(pos.unrealizedPnl)} ({(pos.unrealizedPnlPct ?? 0).toFixed(1)}%)</span>
              <span className="w-10 text-right text-muted-foreground tabular-nums py-1">{ago(pos.entryTime)}</span>
            </div>
            {pp && (
              <div className="flex items-center text-[11px] border-b border-border/30 hover:bg-muted/50 px-3">
                <span className="w-16 shrink-0 py-1" /><span className="w-20 shrink-0 py-1" />
                <span className="w-10 shrink-0 py-1 text-orange-600 dark:text-orange-400">PSS</span>
                <span className="flex-1 text-right tabular-nums py-1">{$(pp.entryUsd)}</span>
                <span className="flex-1 text-right tabular-nums py-1">{$(pp.currentValueUsd)}</span>
                <span className={`flex-1 text-right tabular-nums py-1 font-medium ${pc(pp.unrealizedPnl)}`}>{ps(pp.unrealizedPnl)}{$(pp.unrealizedPnl)} ({(pp.unrealizedPnlPct ?? 0).toFixed(1)}%)</span>
                <span className="w-10 shrink-0 py-1" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TradesTab({ snap }: { snap: Snapshot }) {
  if (snap.recentTrades.length === 0) return <div className="text-xs text-muted-foreground py-6 text-center">No trades yet</div>;
  return (
    <div className="overflow-y-auto" style={{ maxHeight: "calc(100% - 4px)" }}>
      <div className="flex items-center text-[10px] text-muted-foreground border-b border-border uppercase font-medium px-3 sticky top-0 bg-card">
        <span className="w-7 shrink-0 py-1">S</span>
        <span className="w-16 shrink-0 py-1">Token</span>
        <span className="w-20 shrink-0 py-1">Contract</span>
        <span className="flex-1 text-right py-1">Vol</span>
        <span className="flex-1 text-right py-1">MC</span>
        <span className="w-12 text-right py-1">Imp%</span>
        <span className="flex-1 text-right py-1">Ideal</span>
        <span className="flex-1 text-right py-1">Pess</span>
        <span className="w-7 text-right py-1">Tx</span>
        <span className="w-10 text-right py-1">Age</span>
      </div>
      {snap.recentTrades.map((t, i) => (
        <div key={t.originalTx || i} className="flex items-center text-[11px] border-b border-border/30 hover:bg-muted/50 px-3">
          <span className={`w-7 shrink-0 py-1 font-bold ${t.type === "buy" ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"}`}>{t.type === "buy" ? "B" : "S"}</span>
          <span className="w-16 shrink-0 py-1 font-medium">{t.tokenSymbol}</span>
          <span className="w-20 shrink-0 py-1"><CopyBtn text={t.tokenMint} /></span>
          <span className="flex-1 text-right tabular-nums py-1">{$(t.walletUsdVolume)}</span>
          <span className="flex-1 text-right tabular-nums py-1 text-muted-foreground">{t.mcUsd ? $(t.mcUsd) : "-"}</span>
          <span className="w-12 text-right tabular-nums py-1 text-muted-foreground">{(t.priceImpact ?? 0).toFixed(2)}%</span>
          <span className={`flex-1 text-right tabular-nums py-1 ${pc(t.idealTradePnl ?? t.idealPnl)}`}>{ps(t.idealTradePnl ?? t.idealPnl)}{$(t.idealTradePnl ?? t.idealPnl)}</span>
          <span className={`flex-1 text-right tabular-nums py-1 ${pc(t.pessTradePnl ?? t.pessPnl)}`}>{ps(t.pessTradePnl ?? t.pessPnl)}{$(t.pessTradePnl ?? t.pessPnl)}</span>
          <span className="w-7 text-right py-1"><TxLink tx={t.originalTx} /></span>
          <span className="w-10 text-right text-muted-foreground tabular-nums py-1">{ago(t.time)}</span>
        </div>
      ))}
    </div>
  );
}

type Tab = "summary" | "positions" | "trades";

function WalletPanel({ traderId }: { traderId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>("summary");

  useEffect(() => {
    fetch(`/api/paper/${traderId}/snapshot`).then(r => r.json()).then(setSnap).catch(() => {});
    const es = new EventSource(`/api/paper/${traderId}/stream`);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "snapshot" || d.type === "trade") setSnap(d.type === "trade" ? d.state : d);
      } catch {}
    };
    return () => es.close();
  }, [traderId]);

  if (!snap) return <div className="p-4 text-xs text-muted-foreground">Loading {traderId}...</div>;

  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "summary", label: "SUMMARY" },
    { key: "positions", label: "POSITIONS", n: snap.ideal.openPositions.length },
    { key: "trades", label: "TRADES", n: snap.tradeCount },
  ];

  const i = snap.ideal;

  return (
    <div className="flex flex-col min-w-0 h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-amber-600 dark:text-amber-500 font-bold text-xs">{snap.walletLabel.toUpperCase()}</span>
          <span className={`font-bold text-xs tabular-nums ${pc(i.totalPnl)}`}>
            {ps(i.totalPnl)}{$(i.totalPnl)} ({(i.totalPnlPct ?? 0).toFixed(1)}%)
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums">
          <span>{snap.tradeCount} trades</span>
          <span>fees: {$(snap.totalFeesUsd)}</span>
          <span>SOL: {$(snap.solPriceUsd)}</span>
        </div>
      </div>
      <div className="flex border-b border-border bg-card shrink-0">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-[10px] font-medium border-r border-border last:border-r-0 transition-colors ${
              tab === t.key ? "bg-amber-500/10 text-amber-600 dark:text-amber-500" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}>
            {t.label}{t.n != null && t.n > 0 ? ` (${t.n})` : ""}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "summary" && <SummaryTab snap={snap} />}
        {tab === "positions" && <PositionsTab snap={snap} />}
        {tab === "trades" && <TradesTab snap={snap} />}
      </div>
    </div>
  );
}

export default function PaperDashboard() {
  const [selected, setSelected] = useState(TRADERS[0].id);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b border-border bg-card shrink-0">
        <span className="text-[10px] text-amber-600 dark:text-amber-500 font-bold px-3 py-1.5 border-r border-border">PAPER TRADING</span>
        <div className="flex overflow-x-auto">
          {TRADERS.map((t) => (
            <button key={t.id} onClick={() => setSelected(t.id)}
              className={`px-3 py-1.5 text-[11px] font-medium border-r border-border transition-colors whitespace-nowrap ${
                selected === t.id ? "bg-amber-500/10 text-amber-600 dark:text-amber-500" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}>
              {t.label}
            </button>
          ))}
          <span className="px-3 py-1.5 text-[10px] text-muted-foreground">$2K start / $200 max</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <WalletPanel key={selected} traderId={selected} />
      </div>
    </div>
  );
}
