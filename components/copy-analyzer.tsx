"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BackfillSwap {
  signature: string;
  blockTime: number;
  slot: number;
  type: "buy" | "sell";
  tokenMint: string;
  tokenAmount: number;
  tokenDecimals: number;
  solAmount: number;
  pricePerTokenSol: number;
  pricePerTokenUsd: number;
  solPriceUsd: number;
  usdVolume: number;
  estimatedMcUsd: number;
  fee: number;
  dexProgram: string;
}

interface BackfillData {
  wallet: string;
  label: string;
  days: number;
  fetchedAt: number;
  totalSignatures: number;
  swapCount: number;
  swaps: BackfillSwap[];
  solPriceUsd: number;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const TRADERS = [
  { id: "gake", label: "gake", addr: "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm" },
  { id: "idpt", label: "IDPT", addr: "2T5NgDDidkvhJQg8AHDi74uCFwgp25pYFMRZXBaCUNBH" },
  { id: "thedoc", label: "TheDoc", addr: "DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt" },
];

type TimeFilter = "7d" | "30d" | "60d" | "90d";
const TIME_SECS: Record<TimeFilter, number> = {
  "7d": 7 * 86400,
  "30d": 30 * 86400,
  "60d": 60 * 86400,
  "90d": 90 * 86400,
};

// Copy trading parameters
const COPY_SIZE_SOL = 2; // We copy with fixed 2 SOL per trade
const MAX_COPY_USD = 200; // Max USD per trade
const BASE_FEE_SOL = 0.000005;
const PRIORITY_FEE_SOL = 0.0003;
const JITO_TIP_SOL = 0.0005;
const ATA_RENT_SOL = 0.00203;

// Slot delay multipliers: how much worse our price gets at N slots later
// Based on observed price impact compounding with copy competition
const SLOT_MULTIPLIERS: Record<number, number> = { 1: 1.0, 2: 1.8, 4: 3.0 };

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(2);
}
function $(v: number): string { return "$" + fmtUsd(v); }
function pnlColor(v: number): string {
  return v > 0.01 ? "text-green-600 dark:text-green-500" : v < -0.01 ? "text-red-600 dark:text-red-500" : "text-muted-foreground";
}
function sign(v: number): string { return v >= 0 ? "+" : ""; }

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1000); }}
      className="text-[10px] text-amber-600/60 dark:text-amber-500/60 hover:text-amber-600 dark:hover:text-amber-500 transition-colors"
      title={text}
    >
      {c ? "COPIED" : text.slice(0, 4) + ".." + text.slice(-4)}
    </button>
  );
}

// ─── Slot Delay Model ───────────────────────────────────────────────────────

interface SlotResult {
  ourEntrySol: number;
  ourExitSol: number;
  delayCostSol: number;
  slippageSol: number;
  feesSol: number;
  netSol: number; // profit/loss in SOL for this trade leg
}

function computeSlotScenario(
  swap: BackfillSwap,
  slots: number,
  solPrice: number,
  isFirstBuyForToken: boolean,
): SlotResult {
  // How much SOL we'd use to copy (cap at COPY_SIZE_SOL or MAX_COPY_USD/solPrice)
  const maxSol = Math.min(COPY_SIZE_SOL, MAX_COPY_USD / solPrice);
  const ourSol = Math.min(swap.solAmount, maxSol);

  // Price impact: estimate from the original trader's trade size vs pool depth
  // Use their SOL amount as proxy: larger trades = more impact
  // Typical impact: 0.5% for <1 SOL, 1-3% for 1-10 SOL, 3-8% for 10-50 SOL
  let impactPct: number;
  if (swap.solAmount < 1) impactPct = 0.5;
  else if (swap.solAmount < 5) impactPct = 1.0;
  else if (swap.solAmount < 20) impactPct = 2.0;
  else if (swap.solAmount < 50) impactPct = 4.0;
  else impactPct = 6.0;

  const mult = SLOT_MULTIPLIERS[slots] ?? slots;
  const delayCostPct = impactPct * mult;

  // DEX fee
  const isPump = swap.dexProgram.startsWith("6EF8") || swap.dexProgram.startsWith("pAMM") || swap.dexProgram.startsWith("BSfD") || swap.dexProgram.startsWith("PSwap");
  const dexFeePct = isPump ? 1.0 : 0.3;

  // Slippage: higher for smaller/newer tokens
  const slippagePct = swap.estimatedMcUsd < 100000 ? 2.0 :
    swap.estimatedMcUsd < 500000 ? 1.0 :
    swap.estimatedMcUsd < 2000000 ? 0.5 : 0.3;

  // On-chain fees in SOL
  const onChainSol = BASE_FEE_SOL + PRIORITY_FEE_SOL + JITO_TIP_SOL +
    (swap.type === "buy" && isFirstBuyForToken ? ATA_RENT_SOL : 0);

  const feesSol = ourSol * (dexFeePct / 100) + onChainSol;
  const delayCostSol = ourSol * (delayCostPct / 100);
  const slippageSol = ourSol * (slippagePct / 100);

  if (swap.type === "buy") {
    // We pay more for the tokens
    return {
      ourEntrySol: ourSol + feesSol + delayCostSol + slippageSol,
      ourExitSol: 0,
      delayCostSol,
      slippageSol,
      feesSol,
      netSol: -(feesSol + delayCostSol + slippageSol), // additional cost beyond base
    };
  } else {
    // We receive less SOL
    return {
      ourEntrySol: 0,
      ourExitSol: Math.max(0, ourSol - feesSol - delayCostSol - slippageSol),
      delayCostSol,
      slippageSol,
      feesSol,
      netSol: -(feesSol + delayCostSol + slippageSol),
    };
  }
}

// ─── Round Trip Analysis ────────────────────────────────────────────────────

interface RoundTrip {
  tokenMint: string;
  entryTime: number;
  exitTime: number | null;
  isOpen: boolean;
  buys: BackfillSwap[];
  sells: BackfillSwap[];
  // Their actual P&L
  theirBuySol: number;
  theirSellSol: number;
  theirPnlSol: number;
  theirPnlPct: number;
  // Our copy P&L at each slot delay (in SOL)
  ourBuySol: number; // base cost without friction
  ideal: { pnlSol: number; pnlPct: number };
  slot1: { pnlSol: number; pnlPct: number; totalCostSol: number };
  slot2: { pnlSol: number; pnlPct: number; totalCostSol: number };
  slot4: { pnlSol: number; pnlPct: number; totalCostSol: number };
  totalFeesSol: number;
  holdDurationSec: number;
}

function buildRoundTrips(swaps: BackfillSwap[], solPrice: number): RoundTrip[] {
  // Group by token
  const byToken: Record<string, BackfillSwap[]> = {};
  for (const s of swaps) {
    if (!byToken[s.tokenMint]) byToken[s.tokenMint] = [];
    byToken[s.tokenMint].push(s);
  }

  const trips: RoundTrip[] = [];
  const firstBuySeen = new Set<string>();

  for (const [mint, tokenSwaps] of Object.entries(byToken)) {
    const sorted = [...tokenSwaps].sort((a, b) => a.blockTime - b.blockTime);
    const buys = sorted.filter((s) => s.type === "buy");
    const sells = sorted.filter((s) => s.type === "sell");

    if (buys.length === 0) continue;

    const theirBuySol = buys.reduce((s, b) => s + b.solAmount, 0);
    const theirSellSol = sells.reduce((s, b) => s + b.solAmount, 0);
    const isOpen = sells.length === 0 || sells[sells.length - 1].blockTime < buys[buys.length - 1].blockTime;
    const theirPnlSol = theirSellSol - theirBuySol;

    // Our copy: compute for each slot delay
    const maxSol = Math.min(COPY_SIZE_SOL, MAX_COPY_USD / solPrice);
    let ourBaseBuySol = 0;
    let ourBaseSellSol = 0;
    const scenarioTotals: Record<number, { buyCost: number; sellProceeds: number; fees: number }> = {
      1: { buyCost: 0, sellProceeds: 0, fees: 0 },
      2: { buyCost: 0, sellProceeds: 0, fees: 0 },
      4: { buyCost: 0, sellProceeds: 0, fees: 0 },
    };

    for (const buy of buys) {
      const isFirst = !firstBuySeen.has(mint);
      if (isFirst) firstBuySeen.add(mint);
      const baseAmt = Math.min(buy.solAmount, maxSol);
      ourBaseBuySol += baseAmt;

      for (const slots of [1, 2, 4]) {
        const r = computeSlotScenario(buy, slots, solPrice, isFirst);
        scenarioTotals[slots].buyCost += r.ourEntrySol;
        scenarioTotals[slots].fees += r.feesSol;
      }
    }

    for (const sell of sells) {
      const baseAmt = Math.min(sell.solAmount, maxSol);
      ourBaseSellSol += baseAmt;

      for (const slots of [1, 2, 4]) {
        const r = computeSlotScenario(sell, slots, solPrice, false);
        scenarioTotals[slots].sellProceeds += r.ourExitSol;
        scenarioTotals[slots].fees += r.feesSol;
      }
    }

    const idealPnlSol = ourBaseSellSol - ourBaseBuySol;
    const mkScenario = (slots: number) => {
      const s = scenarioTotals[slots];
      const pnl = s.sellProceeds - s.buyCost;
      return {
        pnlSol: pnl,
        pnlPct: ourBaseBuySol > 0 ? (pnl / ourBaseBuySol) * 100 : 0,
        totalCostSol: s.fees,
      };
    };

    const last = sorted[sorted.length - 1];
    trips.push({
      tokenMint: mint,
      entryTime: buys[0].blockTime,
      exitTime: isOpen ? null : last.blockTime,
      isOpen,
      buys,
      sells,
      theirBuySol,
      theirSellSol,
      theirPnlSol,
      theirPnlPct: theirBuySol > 0 ? (theirPnlSol / theirBuySol) * 100 : 0,
      ourBuySol: ourBaseBuySol,
      ideal: {
        pnlSol: idealPnlSol,
        pnlPct: ourBaseBuySol > 0 ? (idealPnlSol / ourBaseBuySol) * 100 : 0,
      },
      slot1: mkScenario(1),
      slot2: mkScenario(2),
      slot4: mkScenario(4),
      totalFeesSol: scenarioTotals[1].fees,
      holdDurationSec: last.blockTime - buys[0].blockTime,
    });
  }

  trips.sort((a, b) => b.entryTime - a.entryTime);
  return trips;
}

// ─── Chart Data Builder ─────────────────────────────────────────────────────

interface ChartPoint {
  time: number;
  date: string;
  theirCum: number;
  idealCum: number;
  slot1Cum: number;
  slot2Cum: number;
  slot4Cum: number;
}

function buildChartData(swaps: BackfillSwap[], solPrice: number): ChartPoint[] {
  const sorted = [...swaps].sort((a, b) => a.blockTime - b.blockTime);
  const maxSol = Math.min(COPY_SIZE_SOL, MAX_COPY_USD / solPrice);
  const firstBuySeen = new Set<string>();

  let theirCum = 0;
  let idealCum = 0;
  const slotCums: Record<number, number> = { 1: 0, 2: 0, 4: 0 };
  const points: ChartPoint[] = [];

  // Track per-token cost basis so we only realize P&L on sells
  const costBasis: Record<string, { theirSol: number; ourSol: number; slotCosts: Record<number, number> }> = {};

  for (const swap of sorted) {
    const ourBase = Math.min(swap.solAmount, maxSol);
    const isFirst = !firstBuySeen.has(swap.tokenMint) && swap.type === "buy";
    if (isFirst) firstBuySeen.add(swap.tokenMint);

    if (swap.type === "buy") {
      // Accumulate cost basis — don't count as P&L yet
      if (!costBasis[swap.tokenMint]) {
        costBasis[swap.tokenMint] = { theirSol: 0, ourSol: 0, slotCosts: { 1: 0, 2: 0, 4: 0 } };
      }
      costBasis[swap.tokenMint].theirSol += swap.solAmount;
      costBasis[swap.tokenMint].ourSol += ourBase;
      for (const slots of [1, 2, 4]) {
        const r = computeSlotScenario(swap, slots, solPrice, isFirst);
        costBasis[swap.tokenMint].slotCosts[slots] += r.ourEntrySol;
      }
    } else {
      // Sell: realize P&L proportional to what was sold
      const basis = costBasis[swap.tokenMint];
      if (basis && basis.theirSol > 0) {
        // What fraction of their position is being sold
        const frac = Math.min(1, swap.solAmount / basis.theirSol);

        // Their realized P&L: sell proceeds - proportional cost
        theirCum += swap.solAmount - basis.theirSol * frac;
        idealCum += ourBase - basis.ourSol * frac;

        for (const slots of [1, 2, 4]) {
          const r = computeSlotScenario(swap, slots, solPrice, false);
          slotCums[slots] += r.ourExitSol - basis.slotCosts[slots] * frac;
        }

        // Reduce cost basis
        basis.theirSol *= (1 - frac);
        basis.ourSol *= (1 - frac);
        for (const slots of [1, 2, 4]) {
          basis.slotCosts[slots] *= (1 - frac);
        }
      } else {
        // No cost basis (sold without tracked buy) — count as pure profit
        theirCum += swap.solAmount;
        idealCum += ourBase;
        for (const slots of [1, 2, 4]) {
          const r = computeSlotScenario(swap, slots, solPrice, false);
          slotCums[slots] += r.ourExitSol;
        }
      }
    }

    points.push({
      time: swap.blockTime * 1000,
      date: new Date(swap.blockTime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      theirCum: Math.round(theirCum * solPrice * 100) / 100,
      idealCum: Math.round(idealCum * solPrice * 100) / 100,
      slot1Cum: Math.round(slotCums[1] * solPrice * 100) / 100,
      slot2Cum: Math.round(slotCums[2] * solPrice * 100) / 100,
      slot4Cum: Math.round(slotCums[4] * solPrice * 100) / 100,
    });
  }

  // Downsample to max 200 points for chart performance
  if (points.length > 200) {
    const step = Math.ceil(points.length / 200);
    return points.filter((_, i) => i % step === 0 || i === points.length - 1);
  }

  return points;
}

// ─── Summary Stats ──────────────────────────────────────────────────────────

interface ScenarioStats {
  netSol: number;
  netUsd: number;
  winRate: number;
  wins: number;
  losses: number;
  pf: number;
  avgWinSol: number;
  avgLossSol: number;
  evSol: number;
}

function computeStats(
  trips: RoundTrip[],
  solPrice: number,
  key: "ideal" | "slot1" | "slot2" | "slot4"
): ScenarioStats {
  const completed = trips.filter((t) => !t.isOpen);
  const getPnl = (t: RoundTrip) => {
    if (key === "ideal") return t.ideal.pnlSol;
    return t[key].pnlSol;
  };

  const wins = completed.filter((t) => getPnl(t) > 0);
  const losses = completed.filter((t) => getPnl(t) <= 0);
  const gp = wins.reduce((s, t) => s + getPnl(t), 0);
  const gl = Math.abs(losses.reduce((s, t) => s + getPnl(t), 0));
  // Only count completed trips for net P&L — open positions are NOT losses
  const netSol = completed.reduce((s, t) => s + getPnl(t), 0);

  return {
    netSol,
    netUsd: netSol * solPrice,
    winRate: completed.length > 0 ? (wins.length / completed.length) * 100 : 0,
    wins: wins.length,
    losses: losses.length,
    pf: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
    avgWinSol: wins.length > 0 ? gp / wins.length : 0,
    avgLossSol: losses.length > 0 ? gl / losses.length : 0,
    evSol: completed.length > 0 ? netSol / completed.length : 0,
  };
}

// ─── Chart Component ────────────────────────────────────────────────────────

function PnLChart({ data }: { data: ChartPoint[] }) {
  if (data.length < 2) {
    return <div className="text-xs text-muted-foreground py-8 text-center">Need at least 2 trades for chart</div>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#666" interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} stroke="#666" tickFormatter={(v) => "$" + v} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 10, fontFamily: "monospace" }}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 9 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: number, name: string) => ["$" + value.toFixed(2), name]) as any}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
          <Line type="monotone" dataKey="theirCum" name="Their Actual P&L" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="idealCum" name="Our Copy (Ideal)" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="slot1Cum" name="+1 Slot (~400ms)" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="slot2Cum" name="+2 Slots (~800ms)" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="slot4Cum" name="+4 Slots (~1.6s)" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="2 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function CopyAnalyzer() {
  const [selected, setSelected] = useState(TRADERS[0].id);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30d");
  const [minProfitPct, setMinProfitPct] = useState(0); // 0 = off, 15 = skip trades where their P&L < 15%
  const [data, setData] = useState<BackfillData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/analysis/${selected}`)
      .then((r) => {
        if (!r.ok) throw new Error("No data yet — run backfill");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [selected]);

  // Filter by time
  const filteredSwaps = useMemo(() => {
    if (!data) return [];
    const cutoff = Math.floor(Date.now() / 1000) - TIME_SECS[timeFilter];
    return data.swaps.filter((s) => s.blockTime >= cutoff);
  }, [data, timeFilter]);

  const solPrice = data?.solPriceUsd || 140;

  // Analysis
  const trips = useMemo(() => {
    if (filteredSwaps.length === 0) return [];
    return buildRoundTrips(filteredSwaps, solPrice);
  }, [filteredSwaps, solPrice]);

  // Filter out trips where the trader's profit % is below the min threshold
  // This handles the IDPT problem: tiny-margin trades that can't be copied profitably
  const copyableTrips = useMemo(() => {
    if (minProfitPct === 0) return trips;
    return trips.map((t) => {
      if (t.isOpen) return t; // keep open trips as-is (they're excluded from stats anyway)
      if (t.theirPnlPct >= minProfitPct) return t; // passes filter
      return null; // skip: their margin too thin to copy
    }).filter(Boolean) as RoundTrip[];
  }, [trips, minProfitPct]);

  // For the chart, filter out swaps belonging to tokens that failed the min profit filter
  const copyableSwaps = useMemo(() => {
    if (minProfitPct === 0) return filteredSwaps;
    const copyableTokens = new Set(copyableTrips.map((t) => t.tokenMint));
    return filteredSwaps.filter((s) => copyableTokens.has(s.tokenMint));
  }, [filteredSwaps, copyableTrips, minProfitPct]);

  const skippedTrips = useMemo(() => {
    if (minProfitPct === 0) return 0;
    return trips.filter((t) => !t.isOpen && t.theirPnlPct < minProfitPct).length;
  }, [trips, minProfitPct]);

  const chartData = useMemo(() => {
    if (copyableSwaps.length === 0) return [];
    return buildChartData(copyableSwaps, solPrice);
  }, [copyableSwaps, solPrice]);

  const stats = useMemo(() => {
    if (copyableTrips.length === 0) return null;
    const completedOnly = copyableTrips.filter((t) => !t.isOpen);
    const their = {
      // Only count completed round trips — open positions are NOT losses
      netSol: completedOnly.reduce((s, t) => s + t.theirPnlSol, 0),
      totalBuySol: completedOnly.reduce((s, t) => s + t.theirBuySol, 0),
      totalSellSol: completedOnly.reduce((s, t) => s + t.theirSellSol, 0),
    };
    return {
      totalSwaps: copyableSwaps.length,
      totalBuys: copyableSwaps.filter((s) => s.type === "buy").length,
      totalSells: copyableSwaps.filter((s) => s.type === "sell").length,
      uniqueTokens: new Set(copyableSwaps.map((s) => s.tokenMint)).size,
      totalTrips: copyableTrips.length,
      completedTrips: completedOnly.length,
      openTrips: copyableTrips.filter((t) => t.isOpen).length,
      their,
      theirNetUsd: their.netSol * solPrice,
      ideal: computeStats(copyableTrips, solPrice, "ideal"),
      s1: computeStats(copyableTrips, solPrice, "slot1"),
      s2: computeStats(copyableTrips, solPrice, "slot2"),
      s4: computeStats(copyableTrips, solPrice, "slot4"),
      totalFeesSol: copyableTrips.reduce((s, t) => s + t.totalFeesSol, 0),
      skippedTrips,
    };
  }, [copyableTrips, copyableSwaps, solPrice, skippedTrips]);

  // ─── Render ──────────────────────────────────────────────────────────

  const Metric = ({ label, v, pnl }: { label: string; v: string; pnl?: number }) => (
    <div className="flex items-center justify-between py-0.5 border-b border-border/20 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${pnl != null ? pnlColor(pnl) : ""}`}>{v}</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card shrink-0">
        <div className="flex items-center">
          <span className="text-[10px] text-amber-600 dark:text-amber-500 font-bold px-3 py-2 border-r border-border">
            BACKFILL ANALYSIS
          </span>
          {TRADERS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`px-3 py-2 text-[11px] font-medium border-r border-border transition-colors ${
                selected === t.id
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0 pr-1">
          <div className="flex items-center mr-2 border-r border-border pr-2">
            <span className="text-[9px] text-muted-foreground mr-1">MIN&nbsp;P&L</span>
            {[0, 15, 25, 50].map((pct) => (
              <button
                key={pct}
                onClick={() => setMinProfitPct(pct)}
                className={`px-1.5 py-1 text-[10px] font-medium rounded transition-colors mx-0.5 ${
                  minProfitPct === pct
                    ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {pct === 0 ? "OFF" : `${pct}%`}
              </button>
            ))}
          </div>
          {(["7d", "30d", "60d", "90d"] as TimeFilter[]).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeFilter(tf)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors mx-0.5 ${
                timeFilter === tf
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-xs text-muted-foreground py-12 text-center">Loading backfill data...</div>
        ) : error ? (
          <div className="text-xs text-red-500 py-12 text-center">{error}</div>
        ) : !stats || stats.totalSwaps === 0 ? (
          <div className="text-xs text-muted-foreground py-12 text-center">
            No trades in the last {timeFilter} for {TRADERS.find((t) => t.id === selected)?.label}
          </div>
        ) : (
          <div className="p-3 space-y-4">
            {/* Verdict */}
            <div className="text-center py-2">
              <div className="text-[10px] text-muted-foreground uppercase font-medium mb-1">
                Would copy trading {TRADERS.find((t) => t.id === selected)?.label} be profitable? ({timeFilter} backfill, {stats.totalSwaps} swaps)
              </div>
              <div className={`text-2xl font-bold tabular-nums ${pnlColor(stats.s1.netUsd)}`}>
                {sign(stats.s1.netUsd)}{$(stats.s1.netUsd)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                at +1 slot delay ({COPY_SIZE_SOL} SOL/trade, fees + slippage) | {stats.completedTrips} completed round trips, {stats.openTrips} open
                {stats.skippedTrips > 0 && (
                  <span className="text-purple-600 dark:text-purple-400"> | {stats.skippedTrips} skipped (&lt;{minProfitPct}% their P&L)</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Their actual: <span className={pnlColor(stats.theirNetUsd)}>{sign(stats.theirNetUsd)}{$(stats.theirNetUsd)}</span> ({stats.their.totalBuySol.toFixed(1)} SOL in, {stats.their.totalSellSol.toFixed(1)} SOL out)
              </div>
              {data && (
                <div className="text-[9px] text-muted-foreground mt-1">
                  Data fetched {new Date(data.fetchedAt).toLocaleString()} | SOL ${solPrice.toFixed(2)} | {data.totalSignatures} total txs scanned
                </div>
              )}
            </div>

            {/* 5 scenario cards: Their actual + 4 copy scenarios */}
            <div className="grid grid-cols-5 gap-2">
              {(() => {
                const cards: { label: string; sub: string; color: string; netSol: number; netUsd: number; ss: ScenarioStats | null }[] = [
                  { label: "THEIR ACTUAL", sub: "real P&L", color: "text-purple-600 dark:text-purple-400", netSol: stats.their.netSol, netUsd: stats.theirNetUsd, ss: null },
                  { label: "OUR COPY (IDEAL)", sub: "0 delay, no fees", color: "text-blue-600 dark:text-blue-400", netSol: stats.ideal.netSol, netUsd: stats.ideal.netUsd, ss: stats.ideal },
                  { label: "+1 SLOT", sub: "~400ms delay", color: "text-amber-600 dark:text-amber-400", netSol: stats.s1.netSol, netUsd: stats.s1.netUsd, ss: stats.s1 },
                  { label: "+2 SLOTS", sub: "~800ms delay", color: "text-orange-600 dark:text-orange-400", netSol: stats.s2.netSol, netUsd: stats.s2.netUsd, ss: stats.s2 },
                  { label: "+4 SLOTS", sub: "~1.6s delay", color: "text-red-600 dark:text-red-400", netSol: stats.s4.netSol, netUsd: stats.s4.netUsd, ss: stats.s4 },
                ];
                return cards.map(({ label, sub, color, netSol, netUsd, ss }) => (
                  <div key={label} className="border border-border rounded p-2 text-[11px]">
                    <div className={`text-[9px] font-bold mb-1 ${color}`}>{label}</div>
                    <div className="text-[10px] text-muted-foreground mb-1.5">{sub}</div>
                    <Metric label="Net P&L" v={`${sign(netUsd)}${$(netUsd)}`} pnl={netUsd} />
                    <Metric label="In SOL" v={`${sign(netSol)}${netSol.toFixed(2)}`} pnl={netSol} />
                    {ss && <Metric label="Win Rate" v={`${ss.winRate.toFixed(0)}% (${ss.wins}W/${ss.losses}L)`} />}
                    {ss && <Metric label="PF" v={ss.pf === Infinity ? "INF" : ss.pf.toFixed(2)} />}
                    {ss && <Metric label="EV/Trade" v={`${sign(ss.evSol * solPrice)}${$(ss.evSol * solPrice)}`} pnl={ss.evSol} />}
                  </div>
                ));
              })()}
            </div>

            {/* Cost summary */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "TOTAL FEES", v: `${stats.totalFeesSol.toFixed(3)} SOL`, v2: $(stats.totalFeesSol * solPrice) },
                { label: "AVG TRADE SIZE", v: `${(filteredSwaps.reduce((s, t) => s + t.solAmount, 0) / filteredSwaps.length).toFixed(2)} SOL` },
                { label: "UNIQUE TOKENS", v: String(stats.uniqueTokens) },
                { label: "BEST +1s TRIP", v: trips.length > 0 ? `${sign(Math.max(...trips.map((t) => t.slot1.pnlSol)) * solPrice)}${$(Math.max(...trips.map((t) => t.slot1.pnlSol)) * solPrice)}` : "-", pnl: Math.max(...trips.map((t) => t.slot1.pnlSol), 0) },
                { label: "WORST +1s TRIP", v: trips.length > 0 ? `${sign(Math.min(...trips.map((t) => t.slot1.pnlSol)) * solPrice)}${$(Math.min(...trips.map((t) => t.slot1.pnlSol)) * solPrice)}` : "-", pnl: Math.min(...trips.map((t) => t.slot1.pnlSol), 0) },
              ].map(({ label, v, v2, pnl }) => (
                <div key={label} className="border border-border rounded p-2 text-center">
                  <div className="text-[9px] text-muted-foreground font-medium">{label}</div>
                  <div className={`text-xs tabular-nums font-medium mt-0.5 ${pnl != null ? pnlColor(pnl) : ""}`}>{v}</div>
                  {v2 && <div className="text-[9px] text-muted-foreground">{v2}</div>}
                </div>
              ))}
            </div>

            {/* Chart */}
            <div>
              <div className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase mb-2">
                CUMULATIVE P&L — THEIR TRADES VS OUR COPY ({timeFilter})
              </div>
              <PnLChart data={chartData} />
            </div>

            {/* Round Trip Table */}
            <div>
              <div className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase mb-2">
                ROUND TRIPS ({stats.completedTrips} completed, {stats.openTrips} open{stats.skippedTrips > 0 ? `, ${stats.skippedTrips} skipped` : ""})
              </div>
              <div className="border border-border rounded overflow-hidden">
                <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase font-medium bg-muted/30 px-3">
                  <span className="w-10 shrink-0 py-1.5">Status</span>
                  <span className="w-20 shrink-0 py-1.5">Contract</span>
                  <span className="w-10 shrink-0 text-right py-1.5">Trades</span>
                  <span className="flex-1 text-right py-1.5">Their SOL</span>
                  <span className="flex-1 text-right py-1.5">Their P&L</span>
                  <span className="flex-1 text-right py-1.5">Ideal</span>
                  <span className="flex-1 text-right py-1.5">+1 Slot</span>
                  <span className="flex-1 text-right py-1.5">+2 Slots</span>
                  <span className="flex-1 text-right py-1.5">+4 Slots</span>
                  <span className="w-14 text-right py-1.5">Hold</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {copyableTrips.map((t) => {
                    const holdStr = t.holdDurationSec < 60 ? `${t.holdDurationSec}s` :
                      t.holdDurationSec < 3600 ? `${Math.floor(t.holdDurationSec / 60)}m` :
                      t.holdDurationSec < 86400 ? `${Math.floor(t.holdDurationSec / 3600)}h${Math.floor((t.holdDurationSec % 3600) / 60)}m` :
                      `${Math.floor(t.holdDurationSec / 86400)}d`;
                    return (
                      <div key={t.tokenMint + t.entryTime} className="flex items-center text-[11px] border-b border-border/30 hover:bg-muted/30 transition-colors px-3">
                        <span className={`w-10 shrink-0 py-1.5 font-bold ${t.isOpen ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                          {t.isOpen ? "OPEN" : "CLSD"}
                        </span>
                        <span className="w-20 shrink-0 py-1.5"><CopyBtn text={t.tokenMint} /></span>
                        <span className="w-10 shrink-0 text-right py-1.5 text-muted-foreground tabular-nums">{t.buys.length}B/{t.sells.length}S</span>
                        <span className="flex-1 text-right py-1.5 tabular-nums text-muted-foreground">{t.theirBuySol.toFixed(2)}/{t.theirSellSol.toFixed(2)}</span>
                        <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pnlColor(t.theirPnlSol)}`}>
                          {sign(t.theirPnlSol * solPrice)}{$(t.theirPnlSol * solPrice)}
                        </span>
                        <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pnlColor(t.ideal.pnlSol)}`}>
                          {sign(t.ideal.pnlSol * solPrice)}{$(t.ideal.pnlSol * solPrice)}
                        </span>
                        <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pnlColor(t.slot1.pnlSol)}`}>
                          {sign(t.slot1.pnlSol * solPrice)}{$(t.slot1.pnlSol * solPrice)}
                        </span>
                        <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pnlColor(t.slot2.pnlSol)}`}>
                          {sign(t.slot2.pnlSol * solPrice)}{$(t.slot2.pnlSol * solPrice)}
                        </span>
                        <span className={`flex-1 text-right py-1.5 tabular-nums font-medium ${pnlColor(t.slot4.pnlSol)}`}>
                          {sign(t.slot4.pnlSol * solPrice)}{$(t.slot4.pnlSol * solPrice)}
                        </span>
                        <span className="w-14 text-right py-1.5 text-muted-foreground tabular-nums">{holdStr}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Individual Trade Log */}
            <div>
              <div className="text-[10px] text-amber-600 dark:text-amber-500 font-bold uppercase mb-2">
                TRADE LOG — THEIR ENTRY vs OUR DELAYED ENTRY ({copyableSwaps.length} swaps)
              </div>
              <div className="border border-border rounded overflow-hidden">
                <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase font-medium bg-muted/30 px-3">
                  <span className="w-7 shrink-0 py-1.5">S</span>
                  <span className="w-20 shrink-0 py-1.5">Contract</span>
                  <span className="flex-1 text-right py-1.5">Their SOL</span>
                  <span className="flex-1 text-right py-1.5">Our SOL</span>
                  <span className="flex-1 text-right py-1.5">+1s Cost</span>
                  <span className="flex-1 text-right py-1.5">+2s Cost</span>
                  <span className="flex-1 text-right py-1.5">+4s Cost</span>
                  <span className="w-12 text-right py-1.5">DEX</span>
                  <span className="w-14 text-right py-1.5">Date</span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {copyableSwaps.slice(0, 200).map((swap, i) => {
                    const maxSol = Math.min(COPY_SIZE_SOL, MAX_COPY_USD / solPrice);
                    const ourBase = Math.min(swap.solAmount, maxSol);
                    const s1 = computeSlotScenario(swap, 1, solPrice, false);
                    const s2 = computeSlotScenario(swap, 2, solPrice, false);
                    const s4 = computeSlotScenario(swap, 4, solPrice, false);
                    const isBuy = swap.type === "buy";
                    const dexShort = swap.dexProgram.slice(0, 4);
                    const date = new Date(swap.blockTime * 1000);
                    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

                    return (
                      <div key={swap.signature || i} className="flex items-center text-[10px] border-b border-border/30 hover:bg-muted/30 transition-colors px-3">
                        <span className={`w-7 shrink-0 py-1 font-bold ${isBuy ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"}`}>
                          {isBuy ? "B" : "S"}
                        </span>
                        <span className="w-20 shrink-0 py-1"><CopyBtn text={swap.tokenMint} /></span>
                        <span className="flex-1 text-right tabular-nums py-1">{swap.solAmount.toFixed(3)}</span>
                        <span className="flex-1 text-right tabular-nums py-1">{ourBase.toFixed(3)}</span>
                        <span className="flex-1 text-right tabular-nums py-1 text-amber-600 dark:text-amber-500">
                          {(s1.feesSol + s1.delayCostSol + s1.slippageSol).toFixed(4)}
                        </span>
                        <span className="flex-1 text-right tabular-nums py-1 text-orange-600 dark:text-orange-500">
                          {(s2.feesSol + s2.delayCostSol + s2.slippageSol).toFixed(4)}
                        </span>
                        <span className="flex-1 text-right tabular-nums py-1 text-red-600 dark:text-red-500">
                          {(s4.feesSol + s4.delayCostSol + s4.slippageSol).toFixed(4)}
                        </span>
                        <span className="w-12 text-right py-1 text-muted-foreground">{dexShort}</span>
                        <span className="w-14 text-right py-1 text-muted-foreground">{dateStr}</span>
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
