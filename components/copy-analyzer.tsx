"use client";

import { useEffect, useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Position {
  mint: string; symbol: string; name: string; tokens: number;
  avgEntryPrice: number; entryUsd: number; entryTime: number;
  currentValueUsd: number; unrealizedPnl: number; unrealizedPnlPct: number;
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
  ideal: ScenarioData; pessimistic: ScenarioData; recentTrades: Trade[];
}

const TRADERS = [
  { id: "gake", label: "gake" },
  { id: "idontpaytaxes", label: "IDPT" },
  { id: "thedoc", label: "TheDoc" },
];

type TimeFilter = "1d" | "7d" | "30d" | "60d";

const TIME_MS: Record<TimeFilter, number> = {
  "1d": 86400000,
  "7d": 604800000,
  "30d": 2592000000,
  "60d": 5184000000,
};

// ─── Formatters ─────────────────────────────────────────────────────────────

function f(v: number): string { const n = v ?? 0; if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B"; if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M"; if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K"; return n.toFixed(2); }
function $(v: number): string { return "$" + f(v ?? 0); }
function pc(v: number): string { const n = v ?? 0; return n > 0 ? "text-green-600 dark:text-green-500" : n < 0 ? "text-red-600 dark:text-red-500" : "text-muted-foreground"; }
function ps(v: number): string { return (v ?? 0) >= 0 ? "+" : ""; }

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false);
  return (
    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1000); }}
      className="text-[10px] text-amber-600/60 dark:text-amber-500/60 hover:text-amber-600 dark:hover:text-amber-500 transition-colors" title={text}>
      {c ? "COPIED" : text.slice(0, 4) + ".." + text.slice(-4)}
    </button>
  );
}

// ─── Slot Delay Price Model ─────────────────────────────────────────────────
// Models what our entry/exit price would be N slots after the original trade.
// 1 slot = ~400ms. The original trade's price impact tells us how much the
// order book moved. Subsequent slots compound with momentum + copy competition.

const SLOT_MULTIPLIERS = { 1: 1.0, 2: 1.8, 4: 3.0 };
const BASE_FEE = 0.000005;
const PRIORITY_FEE = 0.0003;
const JITO_TIP = 0.0005;
const ATA_RENT = 0.00203;

interface SlotScenario {
  slots: number;
  entryPriceAdj: number; // our adjusted price (higher for buys)
  exitPriceAdj: number;  // our adjusted price (lower for sells)
  delayCostPct: number;  // % price moved against us
  slippagePct: number;
  feesUsd: number;
  totalCostUsd: number;  // entry cost including all friction
  proceedsUsd: number;   // exit proceeds after all friction
  pnlUsd: number;
  pnlPct: number;
}

function computeTradeSlotScenarios(
  trade: Trade,
  solPrice: number,
  isFirstBuy: boolean,
  slotCounts: number[] = [1, 2, 4]
): Record<number, SlotScenario> {
  const isBuy = trade.type === "buy";
  const ourUsd = Math.min(trade.walletUsdVolume, 200);
  const impact = Math.max(trade.priceImpact ?? 0, 0.3); // min 0.3% for any trade
  const price = trade.quotedPriceUsd;

  // DEX fee by pool type
  const isPump = (trade.tokenName || "").toLowerCase().includes("pump") ||
                 (trade.tokenSymbol || "").toLowerCase().includes("pump");
  const dexFeePct = isPump ? 1.2 : 0.3;

  // On-chain fees
  const onChainSol = BASE_FEE + PRIORITY_FEE + JITO_TIP + (isBuy && isFirstBuy ? ATA_RENT : 0);
  const onChainUsd = onChainSol * solPrice;
  const dexFeeUsd = ourUsd * (dexFeePct / 100);
  const feesUsd = dexFeeUsd + onChainUsd;

  // Dynamic slippage estimate from pessimistic vs ideal delta
  const pnlDelta = Math.abs((trade.idealTradePnl ?? 0) - (trade.pessTradePnl ?? 0));
  const slippagePct = ourUsd > 0 ? Math.max((pnlDelta / ourUsd) * 100, 0.5) : 1.0;

  const result: Record<number, SlotScenario> = {};

  for (const slots of slotCounts) {
    const mult = SLOT_MULTIPLIERS[slots as keyof typeof SLOT_MULTIPLIERS] ?? slots;
    const delayCostPct = impact * mult;

    if (isBuy) {
      // Buy: we enter at a worse (higher) price
      const adjPrice = price * (1 + delayCostPct / 100);
      const adjPriceWithSlip = adjPrice * (1 + slippagePct / 100);
      const totalCost = ourUsd + feesUsd + ourUsd * (delayCostPct / 100) + ourUsd * (slippagePct / 100);
      result[slots] = {
        slots, entryPriceAdj: adjPriceWithSlip, exitPriceAdj: 0,
        delayCostPct, slippagePct, feesUsd, totalCostUsd: totalCost,
        proceedsUsd: 0, pnlUsd: 0, pnlPct: 0,
      };
    } else {
      // Sell: we exit at a worse (lower) price
      const adjPrice = price * (1 - delayCostPct / 100);
      const adjPriceWithSlip = adjPrice * (1 - slippagePct / 100);
      const proceeds = Math.max(0, ourUsd - feesUsd - ourUsd * (delayCostPct / 100) - ourUsd * (slippagePct / 100));
      result[slots] = {
        slots, entryPriceAdj: 0, exitPriceAdj: adjPriceWithSlip,
        delayCostPct, slippagePct, feesUsd, totalCostUsd: 0,
        proceedsUsd: proceeds, pnlUsd: 0, pnlPct: 0,
      };
    }
  }

  return result;
}

// ─── Round Trip Analysis ────────────────────────────────────────────────────

interface RoundTrip {
  mint: string; symbol: string; name: string;
  entryTime: number; exitTime: number | null; holdMs: number;
  entryMc: number | null; exitMc: number | null;
  isOpen: boolean; buyCount: number; sellCount: number;
  theirEntryPrice: number; theirExitPrice: number | null;
  ourBuyUsd: number;
  idealPnlUsd: number; idealPnlPct: number;
  // Per-slot scenario P&L
  slot1PnlUsd: number; slot1PnlPct: number;
  slot2PnlUsd: number; slot2PnlPct: number;
  slot4PnlUsd: number; slot4PnlPct: number;
  // Costs
  totalFeesUsd: number; totalSlippageUsd: number; totalDelayUsd: number;
  avgImpact: number;
}

function analyzeWallet(
  trades: Trade[],
  solPrice: number,
  openPositions: Position[],
): { trips: RoundTrip[]; chartData: { time: number; label: string; ideal: number; slot1: number; slot2: number; slot4: number }[] } {

  const byToken: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (!byToken[t.tokenMint]) byToken[t.tokenMint] = [];
    byToken[t.tokenMint].push(t);
  }

  const trips: RoundTrip[] = [];
  const seenAtas = new Set<string>();

  // For chart: cumulative P&L over time
  const chronoTrades = [...trades].sort((a, b) => a.time - b.time);
  let cumIdeal = 0, cumSlot1 = 0, cumSlot2 = 0, cumSlot4 = 0;
  const chartData: { time: number; label: string; ideal: number; slot1: number; slot2: number; slot4: number }[] = [];

  // Process chronological trades for chart
  for (const trade of chronoTrades) {
    const isFirstBuy = !seenAtas.has(trade.tokenMint) && trade.type === "buy";
    if (isFirstBuy) seenAtas.add(trade.tokenMint);

    const scenarios = computeTradeSlotScenarios(trade, solPrice, isFirstBuy);
    const idealDelta = trade.idealTradePnl ?? 0;

    // For each slot scenario, the PnL hit is: ideal - (delay cost + slippage + fees)
    const s1 = scenarios[1], s2 = scenarios[2], s4 = scenarios[4];
    const ourUsd = Math.min(trade.walletUsdVolume, 200);
    const s1cost = ourUsd * (s1.delayCostPct / 100) + ourUsd * (s1.slippagePct / 100) + s1.feesUsd;
    const s2cost = ourUsd * (s2.delayCostPct / 100) + ourUsd * (s2.slippagePct / 100) + s2.feesUsd;
    const s4cost = ourUsd * (s4.delayCostPct / 100) + ourUsd * (s4.slippagePct / 100) + s4.feesUsd;

    cumIdeal += idealDelta;
    cumSlot1 += idealDelta - s1cost;
    cumSlot2 += idealDelta - s2cost;
    cumSlot4 += idealDelta - s4cost;

    chartData.push({
      time: trade.time,
      label: `${trade.type === "buy" ? "B" : "S"} ${trade.tokenSymbol}`,
      ideal: Math.round(cumIdeal * 100) / 100,
      slot1: Math.round(cumSlot1 * 100) / 100,
      slot2: Math.round(cumSlot2 * 100) / 100,
      slot4: Math.round(cumSlot4 * 100) / 100,
    });
  }

  // Process round trips by token
  seenAtas.clear();
  for (const [mint, tokenTrades] of Object.entries(byToken)) {
    const sorted = [...tokenTrades].sort((a, b) => a.time - b.time);
    const buys = sorted.filter(t => t.type === "buy");
    const sells = sorted.filter(t => t.type === "sell");
    if (buys.length === 0) continue;

    const firstBuy = buys[0];
    const lastTrade = sorted[sorted.length - 1];
    const isOpen = openPositions.some(p => p.mint === mint);

    let ourTotalBuy = 0;
    let totalFees = 0, totalSlippage = 0, totalDelay1 = 0, totalDelay2 = 0, totalDelay4 = 0;
    let impactSum = 0, impactCount = 0;

    for (const buy of buys) {
      const isFirst = !seenAtas.has(mint);
      if (isFirst) seenAtas.add(mint);
      const ourUsd = Math.min(buy.walletUsdVolume, 200);
      ourTotalBuy += ourUsd;
      const s = computeTradeSlotScenarios(buy, solPrice, isFirst);
      totalFees += s[1].feesUsd;
      totalSlippage += ourUsd * (s[1].slippagePct / 100);
      totalDelay1 += ourUsd * (s[1].delayCostPct / 100);
      totalDelay2 += ourUsd * (s[2].delayCostPct / 100);
      totalDelay4 += ourUsd * (s[4].delayCostPct / 100);
      impactSum += buy.priceImpact ?? 0;
      impactCount++;
    }

    for (const sell of sells) {
      const ourUsd = Math.min(sell.walletUsdVolume, 200);
      const s = computeTradeSlotScenarios(sell, solPrice, false);
      totalFees += s[1].feesUsd;
      totalSlippage += ourUsd * (s[1].slippagePct / 100);
      totalDelay1 += ourUsd * (s[1].delayCostPct / 100);
      totalDelay2 += ourUsd * (s[2].delayCostPct / 100);
      totalDelay4 += ourUsd * (s[4].delayCostPct / 100);
      impactSum += sell.priceImpact ?? 0;
      impactCount++;
    }

    const idealPnlRaw = sorted.reduce((s, t) => s + (t.idealTradePnl ?? 0), 0);
    const openPos = openPositions.find(p => p.mint === mint);
    const unrealized = openPos?.unrealizedPnl ?? 0;
    const idealPnl = idealPnlRaw + unrealized;

    const slot1Pnl = idealPnl - totalFees - totalSlippage - totalDelay1;
    const slot2Pnl = idealPnl - totalFees - totalSlippage - totalDelay2;
    const slot4Pnl = idealPnl - totalFees - totalSlippage - totalDelay4;

    trips.push({
      mint, symbol: firstBuy.tokenSymbol, name: firstBuy.tokenName,
      entryTime: firstBuy.time, exitTime: isOpen ? null : lastTrade.time,
      holdMs: lastTrade.time - firstBuy.time,
      entryMc: firstBuy.mcUsd, exitMc: sells.length > 0 ? sells[sells.length - 1].mcUsd : null,
      isOpen, buyCount: buys.length, sellCount: sells.length,
      theirEntryPrice: firstBuy.quotedPriceUsd,
      theirExitPrice: sells.length > 0 ? sells[sells.length - 1].quotedPriceUsd : null,
      ourBuyUsd: ourTotalBuy,
      idealPnlUsd: idealPnl, idealPnlPct: ourTotalBuy > 0 ? (idealPnl / ourTotalBuy) * 100 : 0,
      slot1PnlUsd: slot1Pnl, slot1PnlPct: ourTotalBuy > 0 ? (slot1Pnl / ourTotalBuy) * 100 : 0,
      slot2PnlUsd: slot2Pnl, slot2PnlPct: ourTotalBuy > 0 ? (slot2Pnl / ourTotalBuy) * 100 : 0,
      slot4PnlUsd: slot4Pnl, slot4PnlPct: ourTotalBuy > 0 ? (slot4Pnl / ourTotalBuy) * 100 : 0,
      totalFeesUsd: totalFees, totalSlippageUsd: totalSlippage, totalDelayUsd: totalDelay1,
      avgImpact: impactCount > 0 ? impactSum / impactCount : 0,
    });
  }

  trips.sort((a, b) => b.entryTime - a.entryTime);
  return { trips, chartData };
}

// ─── Chart Component ────────────────────────────────────────────────────────

function PnLChart({ data }: { data: { time: number; label: string; ideal: number; slot1: number; slot2: number; slot4: number }[] }) {
  if (data.length < 2) return <div className="text-xs text-muted-foreground py-8 text-center">Need at least 2 trades for chart</div>;

  const formatted = data.map(d => ({
    ...d,
    date: new Date(d.time).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formatted} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#666" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} stroke="#666" tickFormatter={(v) => "$" + v} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 10, fontFamily: "monospace" }}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: number, name: string) => ["$" + value.toFixed(2), name]) as any}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="ideal" name="Their Price (Ideal)" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="slot1" name="+1 Slot (~400ms)" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="slot2" name="+2 Slots (~800ms)" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="slot4" name="+4 Slots (~1.6s)" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="2 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Analyzer ──────────────────────────────────────────────────────────

export default function CopyAnalyzer() {
  const [selected, setSelected] = useState(TRADERS[0].id);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30d");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);

  useEffect(() => {
    setSnap(null);
    setAllTrades([]);
    fetch(`/api/paper/${selected}/snapshot`).then(r => r.json()).then(setSnap).catch(() => {});
    fetch(`/api/paper/${selected}/trades`).then(r => r.json()).then(d => {
      if (d.trades) setAllTrades(d.trades);
    }).catch(() => {});
    const es = new EventSource(`/api/paper/${selected}/stream`);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "snapshot" || d.type === "trade") {
          setSnap(d.type === "trade" ? d.state : d);
          if (d.type === "trade" && d.trade) setAllTrades(prev => [d.trade, ...prev].slice(0, 500));
        }
      } catch {}
    };
    return () => es.close();
  }, [selected]);

  const filteredTrades = useMemo(() => {
    const cutoff = Date.now() - TIME_MS[timeFilter];
    const trades = allTrades.length > 0 ? allTrades : (snap?.recentTrades ?? []);
    return trades.filter(t => t.time >= cutoff);
  }, [allTrades, snap, timeFilter]);

  const analysis = useMemo(() => {
    if (!snap || filteredTrades.length === 0) return null;
    return analyzeWallet(filteredTrades, snap.solPriceUsd || 140, snap.ideal.openPositions);
  }, [filteredTrades, snap]);

  // Compute summary stats
  const stats = useMemo(() => {
    if (!analysis) return null;
    const { trips } = analysis;
    const completed = trips.filter(t => !t.isOpen);
    const mk = (key: "idealPnlUsd" | "slot1PnlUsd" | "slot2PnlUsd" | "slot4PnlUsd") => {
      const wins = completed.filter(t => t[key] > 0);
      const losses = completed.filter(t => t[key] <= 0);
      const gp = wins.reduce((s, t) => s + t[key], 0);
      const gl = Math.abs(losses.reduce((s, t) => s + t[key], 0));
      const net = trips.reduce((s, t) => s + t[key], 0);
      return {
        net, winRate: completed.length > 0 ? (wins.length / completed.length) * 100 : 0,
        wins: wins.length, losses: losses.length,
        pf: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
        avgWin: wins.length > 0 ? gp / wins.length : 0,
        avgLoss: losses.length > 0 ? gl / losses.length : 0,
        ev: completed.length > 0 ? net / completed.length : 0,
      };
    };
    return {
      total: filteredTrades.length,
      trips: trips.length,
      completed: completed.length,
      open: trips.filter(t => t.isOpen).length,
      ideal: mk("idealPnlUsd"),
      s1: mk("slot1PnlUsd"),
      s2: mk("slot2PnlUsd"),
      s4: mk("slot4PnlUsd"),
      totalFees: trips.reduce((s, t) => s + t.totalFeesUsd, 0),
      totalSlippage: trips.reduce((s, t) => s + t.totalSlippageUsd, 0),
      totalDelay: trips.reduce((s, t) => s + t.totalDelayUsd, 0),
      best: Math.max(...trips.map(t => t.slot1PnlUsd), 0),
      worst: Math.min(...trips.map(t => t.slot1PnlUsd), 0),
    };
  }, [analysis, filteredTrades]);

  const Metric = ({ label, v, sub, pnl }: { label: string; v: string; sub?: string; pnl?: number }) => (
    <div className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${pnl != null ? pc(pnl) : ""}`}>{v}{sub ? <span className="text-muted-foreground ml-1 font-normal">{sub}</span> : null}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: wallet selector + time filter */}
      <div className="flex items-center justify-between border-b border-border bg-card shrink-0">
        <div className="flex items-center">
          <span className="text-[10px] text-amber-600 dark:text-amber-500 font-bold px-3 py-2 border-r border-border">COPY ANALYSIS</span>
          {TRADERS.map((t) => (
            <button key={t.id} onClick={() => setSelected(t.id)}
              className={`px-3 py-2 text-[11px] font-medium border-r border-border transition-colors ${
                selected === t.id ? "bg-amber-500/10 text-amber-600 dark:text-amber-500" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0 pr-1">
          {(["1d", "7d", "30d", "60d"] as TimeFilter[]).map((tf) => (
            <button key={tf} onClick={() => setTimeFilter(tf)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors mx-0.5 ${
                timeFilter === tf ? "bg-amber-500/15 text-amber-600 dark:text-amber-500" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}>
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!snap ? (
          <div className="text-xs text-muted-foreground py-12 text-center">Loading...</div>
        ) : !stats || stats.total === 0 ? (
          <div className="text-xs text-muted-foreground py-12 text-center">No trades in the last {timeFilter} for {TRADERS.find(t => t.id === selected)?.label}</div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Verdict */}
            <div className="text-center py-2">
              <div className="text-[10px] text-muted-foreground uppercase font-medium mb-1">
                Would copy trading {TRADERS.find(t => t.id === selected)?.label} be profitable? ({timeFilter})
              </div>
              <div className={`text-2xl font-bold tabular-nums ${pc(stats.s1.net)}`}>
                {ps(stats.s1.net)}{$(stats.s1.net)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                at +1 slot delay with fees + slippage | {stats.completed} completed round trips
              </div>
            </div>

            {/* 4 scenario cards */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "THEIR PRICE", sub: "ideal, no delay", color: "text-blue-600 dark:text-blue-400", d: stats.ideal },
                { label: "+1 SLOT", sub: "~400ms delay", color: "text-amber-600 dark:text-amber-400", d: stats.s1 },
                { label: "+2 SLOTS", sub: "~800ms delay", color: "text-orange-600 dark:text-orange-400", d: stats.s2 },
                { label: "+4 SLOTS", sub: "~1.6s delay", color: "text-red-600 dark:text-red-400", d: stats.s4 },
              ].map(({ label, sub, color, d }) => (
                <div key={label} className="border border-border rounded p-2.5 text-[11px]">
                  <div className={`text-[9px] font-bold mb-1.5 ${color}`}>{label}</div>
                  <div className="text-[10px] text-muted-foreground mb-2">{sub}</div>
                  <Metric label="Net P&L" v={`${ps(d.net)}${$(d.net)}`} pnl={d.net} />
                  <Metric label="Win Rate" v={`${d.winRate.toFixed(0)}%`} sub={`${d.wins}W/${d.losses}L`} />
                  <Metric label="PF" v={d.pf === Infinity ? "INF" : d.pf.toFixed(2)} />
                  <Metric label="Avg Win" v={$(d.avgWin)} pnl={d.avgWin} />
                  <Metric label="Avg Loss" v={$(d.avgLoss)} pnl={-d.avgLoss} />
                  <Metric label="EV/Trade" v={`${ps(d.ev)}${$(d.ev)}`} pnl={d.ev} />
                </div>
              ))}
            </div>

            {/* Cost breakdown */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "TOTAL FEES", v: $(stats.totalFees) },
                { label: "SLIPPAGE", v: $(stats.totalSlippage) },
                { label: "DELAY COST", v: $(stats.totalDelay) },
                { label: "BEST TRADE", v: `${ps(stats.best)}${$(stats.best)}`, pnl: stats.best },
                { label: "WORST TRADE", v: `${ps(stats.worst)}${$(stats.worst)}`, pnl: stats.worst },
              ].map(({ label, v, pnl }) => (
                <div key={label} className="border border-border rounded p-2 text-center">
                  <div className="text-[9px] text-muted-foreground font-medium">{label}</div>
                  <div className={`text-xs tabular-nums font-medium mt-0.5 ${pnl != null ? pc(pnl) : ""}`}>{v}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div>
              <div className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase mb-2">CUMULATIVE P&L — THEIR TRADES VS OUR COPY</div>
              {analysis && <PnLChart data={analysis.chartData} />}
            </div>

            {/* Per-trade table */}
            <div>
              <div className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase mb-2">
                ROUND TRIPS ({stats.completed} completed, {stats.open} open)
              </div>
              <div className="border border-border rounded overflow-hidden">
                <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase font-medium bg-muted/30 px-3">
                  <span className="w-10 shrink-0 py-1.5">Status</span>
                  <span className="w-16 shrink-0 py-1.5">Token</span>
                  <span className="w-20 shrink-0 py-1.5">Contract</span>
                  <span className="w-12 shrink-0 text-right py-1.5">Trades</span>
                  <span className="flex-1 text-right py-1.5">Entry MC</span>
                  <span className="flex-1 text-right py-1.5">Our Cost</span>
                  <span className="flex-1 text-right py-1.5">Ideal P&L</span>
                  <span className="flex-1 text-right py-1.5">+1 Slot</span>
                  <span className="flex-1 text-right py-1.5">+2 Slots</span>
                  <span className="flex-1 text-right py-1.5">+4 Slots</span>
                  <span className="flex-1 text-right py-1.5">Fees</span>
                  <span className="w-10 text-right py-1.5">Imp%</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {analysis?.trips.map((t) => (
                    <div key={t.mint} className="flex items-center text-[11px] border-b border-border/30 hover:bg-muted/30 transition-colors px-3">
                      <span className={`w-10 shrink-0 py-1.5 font-bold ${t.isOpen ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                        {t.isOpen ? "OPEN" : "CLSD"}
                      </span>
                      <span className="w-16 shrink-0 py-1.5 font-medium">{t.symbol}</span>
                      <span className="w-20 shrink-0 py-1.5"><CopyBtn text={t.mint} /></span>
                      <span className="w-12 shrink-0 text-right py-1.5 text-muted-foreground tabular-nums">{t.buyCount}B/{t.sellCount}S</span>
                      <span className="flex-1 text-right py-1.5 text-muted-foreground tabular-nums">{t.entryMc ? $(t.entryMc) : "-"}</span>
                      <span className="flex-1 text-right py-1.5 tabular-nums">{$(t.ourBuyUsd)}</span>
                      <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pc(t.idealPnlUsd)}`}>{ps(t.idealPnlUsd)}{$(t.idealPnlUsd)}</span>
                      <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pc(t.slot1PnlUsd)}`}>{ps(t.slot1PnlUsd)}{$(t.slot1PnlUsd)}</span>
                      <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pc(t.slot2PnlUsd)}`}>{ps(t.slot2PnlUsd)}{$(t.slot2PnlUsd)}</span>
                      <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pc(t.slot4PnlUsd)}`}>{ps(t.slot4PnlUsd)}{$(t.slot4PnlUsd)}</span>
                      <span className="flex-1 text-right py-1.5 text-muted-foreground tabular-nums">{$(t.totalFeesUsd)}</span>
                      <span className="w-10 text-right py-1.5 text-muted-foreground tabular-nums">{t.avgImpact.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Per-trade detail: their price vs our price at each delay */}
            <div>
              <div className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase mb-2">
                TRADE-BY-TRADE PRICE COMPARISON
              </div>
              <div className="border border-border rounded overflow-hidden">
                <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase font-medium bg-muted/30 px-3">
                  <span className="w-7 shrink-0 py-1.5">S</span>
                  <span className="w-16 shrink-0 py-1.5">Token</span>
                  <span className="flex-1 text-right py-1.5">Their Price</span>
                  <span className="flex-1 text-right py-1.5">+1s Price</span>
                  <span className="flex-1 text-right py-1.5">+2s Price</span>
                  <span className="flex-1 text-right py-1.5">+4s Price</span>
                  <span className="w-12 text-right py-1.5">Impact</span>
                  <span className="flex-1 text-right py-1.5">+1s Diff</span>
                  <span className="flex-1 text-right py-1.5">+4s Diff</span>
                  <span className="w-12 text-right py-1.5">Vol</span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredTrades.slice(0, 100).map((t, i) => {
                    const impact = Math.max(t.priceImpact ?? 0, 0.3);
                    const price = t.quotedPriceUsd;
                    const isBuy = t.type === "buy";
                    const p1 = isBuy ? price * (1 + impact * 1.0 / 100) : price * (1 - impact * 1.0 / 100);
                    const p2 = isBuy ? price * (1 + impact * 1.8 / 100) : price * (1 - impact * 1.8 / 100);
                    const p4 = isBuy ? price * (1 + impact * 3.0 / 100) : price * (1 - impact * 3.0 / 100);
                    const diff1 = ((p1 - price) / price) * 100;
                    const diff4 = ((p4 - price) / price) * 100;
                    const fmtPrice = (p: number) => {
                      if (p >= 1) return "$" + p.toFixed(4);
                      if (p >= 0.0001) return "$" + p.toFixed(6);
                      return "$" + p.toExponential(3);
                    };
                    return (
                      <div key={t.originalTx || i} className="flex items-center text-[10px] border-b border-border/30 hover:bg-muted/30 transition-colors px-3">
                        <span className={`w-7 shrink-0 py-1 font-bold ${isBuy ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"}`}>{isBuy ? "B" : "S"}</span>
                        <span className="w-16 shrink-0 py-1 font-medium">{t.tokenSymbol}</span>
                        <span className="flex-1 text-right tabular-nums py-1">{fmtPrice(price)}</span>
                        <span className="flex-1 text-right tabular-nums py-1 text-amber-600 dark:text-amber-500">{fmtPrice(p1)}</span>
                        <span className="flex-1 text-right tabular-nums py-1 text-orange-600 dark:text-orange-500">{fmtPrice(p2)}</span>
                        <span className="flex-1 text-right tabular-nums py-1 text-red-600 dark:text-red-500">{fmtPrice(p4)}</span>
                        <span className="w-12 text-right tabular-nums py-1 text-muted-foreground">{impact.toFixed(2)}%</span>
                        <span className={`flex-1 text-right tabular-nums py-1 ${pc(isBuy ? -diff1 : diff1)}`}>{diff1 >= 0 ? "+" : ""}{diff1.toFixed(2)}%</span>
                        <span className={`flex-1 text-right tabular-nums py-1 ${pc(isBuy ? -diff4 : diff4)}`}>{diff4 >= 0 ? "+" : ""}{diff4.toFixed(2)}%</span>
                        <span className="w-12 text-right tabular-nums py-1 text-muted-foreground">{$(t.walletUsdVolume)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
