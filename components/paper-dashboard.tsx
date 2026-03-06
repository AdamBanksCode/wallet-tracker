"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Wallet Config ──────────────────────────────────────────────────────────

const TRADERS = [
  { id: "gake", label: "gake" },
  { id: "idontpaytaxes", label: "IDPT" },
  { id: "thedoc", label: "TheDoc" },
];

// ─── Formatters ─────────────────────────────────────────────────────────────

function f(v: number): string {
  const n = v ?? 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}
function $(v: number): string { return "$" + f(v ?? 0); }
function pc(v: number): string { const n = v ?? 0; return n > 0 ? "text-green-500" : n < 0 ? "text-red-500" : "text-muted-foreground"; }
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
    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setC(true); setTimeout(() => setC(false), 1000); }}
      className="text-[9px] text-amber-500/60 hover:text-amber-500 transition-colors" title={text}>
      {c ? "COPIED" : text.slice(0, 4) + ".." + text.slice(-4)}
    </button>
  );
}

function TxLink({ tx }: { tx: string }) {
  if (!tx) return null;
  return <a href={`https://solscan.io/tx/${tx}`} target="_blank" rel="noopener noreferrer"
    className="text-[9px] text-cyan-600 hover:text-cyan-400" onClick={(e) => e.stopPropagation()}>tx</a>;
}

// ─── Copy Trade Analyzer ────────────────────────────────────────────────────

interface RoundTrip {
  mint: string; symbol: string; name: string;
  entryTime: number; exitTime: number | null;
  entryMc: number | null; exitMc: number | null;
  holdMs: number;
  // Their trade
  theirBuyUsd: number; theirSellUsd: number;
  // Our copy - ideal (same price as them)
  ourBuyUsd: number; ourSellUsd: number;
  idealPnlUsd: number; idealPnlPct: number;
  // Realistic: 1-slot delay + dynamic slippage + full fees
  realisticBuyUsd: number; realisticSellUsd: number;
  realisticPnlUsd: number; realisticPnlPct: number;
  totalFeesUsd: number; slippageCostUsd: number; delayCostUsd: number;
  // Conservative: 2-slot delay
  conservPnlUsd: number; conservPnlPct: number;
  // Status
  isOpen: boolean;
  buyCount: number; sellCount: number;
  avgPriceImpact: number;
}

interface AnalysisSummary {
  totalTrades: number;
  roundTrips: number;
  completedTrips: number;
  openTrips: number;
  // Ideal
  idealWins: number; idealLosses: number; idealWinRate: number;
  idealGrossProfit: number; idealGrossLoss: number; idealProfitFactor: number;
  idealNetPnl: number; idealAvgWin: number; idealAvgLoss: number;
  idealEV: number;
  // Realistic (1-slot)
  realWins: number; realLosses: number; realWinRate: number;
  realGrossProfit: number; realGrossLoss: number; realProfitFactor: number;
  realNetPnl: number; realAvgWin: number; realAvgLoss: number;
  realEV: number;
  // Conservative (2-slot)
  conWins: number; conLosses: number; conWinRate: number;
  conNetPnl: number; conEV: number;
  // Costs
  totalFees: number; totalSlippage: number; totalDelay: number;
  avgHoldTime: string;
  bestTrade: number; worstTrade: number;
}

// On-chain cost constants (SOL)
const BASE_FEE = 0.000005;
const PRIORITY_FEE = 0.0003;
const JITO_TIP = 0.0005;
const ATA_RENT = 0.00203;

function analyzeWallet(trades: Trade[], solPrice: number, openPositions: Position[]): { summary: AnalysisSummary; trips: RoundTrip[] } {
  // Group trades by token
  const byToken: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (!byToken[t.tokenMint]) byToken[t.tokenMint] = [];
    byToken[t.tokenMint].push(t);
  }

  const trips: RoundTrip[] = [];
  const seenAtas = new Set<string>();

  for (const [mint, tokenTrades] of Object.entries(byToken)) {
    const sorted = [...tokenTrades].sort((a, b) => a.time - b.time);
    const buys = sorted.filter(t => t.type === "buy");
    const sells = sorted.filter(t => t.type === "sell");

    if (buys.length === 0) continue;

    const firstBuy = buys[0];
    const lastTrade = sorted[sorted.length - 1];
    const isOpen = openPositions.some(p => p.mint === mint);

    // Aggregate buy/sell volumes (their amounts)
    let theirTotalBuy = 0, theirTotalSell = 0;
    // Our copy amounts (capped at $200/trade)
    let ourTotalBuy = 0, ourTotalSell = 0;
    let totalFees = 0, totalSlippage = 0, totalDelay = 0;
    let ourRealisticBuy = 0, ourRealisticSell = 0;
    let ourConservBuy = 0, ourConservSell = 0;
    let impactSum = 0, impactCount = 0;

    // Process buys
    for (const buy of buys) {
      const ourUsd = Math.min(buy.walletUsdVolume, 200);
      theirTotalBuy += buy.walletUsdVolume;
      ourTotalBuy += ourUsd;

      const impact = buy.priceImpact ?? 0;
      impactSum += impact;
      impactCount++;

      // DEX fee
      const dexPct = (buy.tokenName || "").toLowerCase().includes("pump") ? 1.2 : 0.3;
      const dexFee = ourUsd * (dexPct / 100);

      // On-chain fees
      const needAta = !seenAtas.has(mint);
      if (needAta) seenAtas.add(mint);
      const onChainSol = BASE_FEE + PRIORITY_FEE + JITO_TIP + (needAta ? ATA_RENT : 0);
      const onChainUsd = onChainSol * solPrice;
      const fees = dexFee + onChainUsd;

      // 1-slot delay: price moved by the original trade's impact
      // Our entry is worse by ~impact%
      const delay1Pct = Math.max(impact, 0.5); // min 0.5% for any delay
      const delay1Cost = ourUsd * (delay1Pct / 100);

      // Slippage: use the pess vs ideal delta as proxy, or 1% fallback
      const idealTokenVal = ourUsd;
      const pessTokenVal = buy.pessTradePnl !== undefined
        ? ourUsd * (1 - Math.abs(buy.idealTradePnl - buy.pessTradePnl) / Math.max(ourUsd, 1))
        : ourUsd * 0.98;
      const slippageCost = Math.max(idealTokenVal - pessTokenVal, 0);

      totalFees += fees;
      totalSlippage += slippageCost;
      totalDelay += delay1Cost;

      // Realistic buy cost (we pay more)
      ourRealisticBuy += ourUsd + fees + slippageCost + delay1Cost;

      // Conservative: 2-slot delay = 1.5x the delay
      const delay2Cost = delay1Cost * 1.5;
      ourConservBuy += ourUsd + fees + slippageCost + delay2Cost;
    }

    // Process sells
    for (const sell of sells) {
      const sellPct = sell.sellPct ?? 1.0;
      // Proportional: if they sell X% of position, we sell X% of ours
      const ourSellBasis = ourTotalBuy * sellPct;
      theirTotalSell += sell.walletUsdVolume;

      // For sell, calculate what we'd receive
      // Ideal: we get proportional to our entry
      const idealSellProceeds = ourSellBasis; // simplified: what we'd get at their price ratio
      // Actually use the PnL data: sell proceeds = entry + pnl
      const sellRatio = sell.walletUsdVolume / Math.max(sell.walletUsdVolume, 0.01);
      ourTotalSell += ourSellBasis * (sell.walletUsdVolume / Math.max(theirTotalBuy * sellPct, 0.01));

      const impact = sell.priceImpact ?? 0;
      impactSum += impact;
      impactCount++;

      const dexPct = (sell.tokenName || "").toLowerCase().includes("pump") ? 1.2 : 0.3;
      const dexFee = ourSellBasis * (dexPct / 100);
      const onChainUsd = (BASE_FEE + PRIORITY_FEE + JITO_TIP) * solPrice;
      const fees = dexFee + onChainUsd;

      const delay1Pct = Math.max(impact, 0.5);
      const delay1Cost = ourSellBasis * (delay1Pct / 100);

      // On sell, slippage means we receive less
      const slippageCost = ourSellBasis * 0.01; // ~1% slippage on sells

      totalFees += fees;
      totalSlippage += slippageCost;
      totalDelay += delay1Cost;

      // Realistic: we receive less
      const realisticSellProceeds = Math.max(0, ourTotalSell - fees - slippageCost - delay1Cost);
      ourRealisticSell += realisticSellProceeds;

      const delay2Cost = delay1Cost * 1.5;
      ourConservSell += Math.max(0, ourTotalSell - fees - slippageCost - delay2Cost);
    }

    // Use actual P&L from paper trader if available
    const idealPnlRaw = buys.reduce((s, t) => s + (t.idealTradePnl ?? 0), 0) +
                         sells.reduce((s, t) => s + (t.idealTradePnl ?? 0), 0);
    const pessPnlRaw = buys.reduce((s, t) => s + (t.pessTradePnl ?? 0), 0) +
                        sells.reduce((s, t) => s + (t.pessTradePnl ?? 0), 0);

    // Add unrealized if open
    const openPos = openPositions.find(p => p.mint === mint);
    const unrealized = openPos?.unrealizedPnl ?? 0;

    const idealPnl = idealPnlRaw + unrealized;
    const idealPnlPct = ourTotalBuy > 0 ? (idealPnl / ourTotalBuy) * 100 : 0;

    // Realistic P&L = ideal - fees - slippage - delay
    const realisticPnl = idealPnl - totalFees - totalSlippage - totalDelay;
    const realisticPnlPct = ourTotalBuy > 0 ? (realisticPnl / ourTotalBuy) * 100 : 0;

    // Conservative: more delay
    const conservDelay = totalDelay * 1.5;
    const conservPnl = idealPnl - totalFees - totalSlippage - conservDelay;
    const conservPnlPct = ourTotalBuy > 0 ? (conservPnl / ourTotalBuy) * 100 : 0;

    const holdMs = (lastTrade.time - firstBuy.time);

    trips.push({
      mint, symbol: firstBuy.tokenSymbol, name: firstBuy.tokenName,
      entryTime: firstBuy.time, exitTime: isOpen ? null : lastTrade.time,
      entryMc: firstBuy.mcUsd, exitMc: sells.length > 0 ? sells[sells.length - 1].mcUsd : null,
      holdMs,
      theirBuyUsd: theirTotalBuy, theirSellUsd: theirTotalSell,
      ourBuyUsd: ourTotalBuy, ourSellUsd: ourTotalSell,
      idealPnlUsd: idealPnl, idealPnlPct,
      realisticBuyUsd: ourRealisticBuy, realisticSellUsd: ourRealisticSell,
      realisticPnlUsd: realisticPnl, realisticPnlPct,
      totalFeesUsd: totalFees, slippageCostUsd: totalSlippage, delayCostUsd: totalDelay,
      conservPnlUsd: conservPnl, conservPnlPct,
      isOpen, buyCount: buys.length, sellCount: sells.length,
      avgPriceImpact: impactCount > 0 ? impactSum / impactCount : 0,
    });
  }

  trips.sort((a, b) => b.entryTime - a.entryTime);

  // Compute summary
  const completed = trips.filter(t => !t.isOpen);
  const idealWins = completed.filter(t => t.idealPnlUsd > 0);
  const idealLosses = completed.filter(t => t.idealPnlUsd <= 0);
  const realWins = completed.filter(t => t.realisticPnlUsd > 0);
  const realLosses = completed.filter(t => t.realisticPnlUsd <= 0);
  const conWins = completed.filter(t => t.conservPnlUsd > 0);
  const conLosses = completed.filter(t => t.conservPnlUsd <= 0);

  const idealGP = idealWins.reduce((s, t) => s + t.idealPnlUsd, 0);
  const idealGL = Math.abs(idealLosses.reduce((s, t) => s + t.idealPnlUsd, 0));
  const realGP = realWins.reduce((s, t) => s + t.realisticPnlUsd, 0);
  const realGL = Math.abs(realLosses.reduce((s, t) => s + t.realisticPnlUsd, 0));

  const avgHoldMs = completed.length > 0 ? completed.reduce((s, t) => s + t.holdMs, 0) / completed.length : 0;
  const avgHoldStr = avgHoldMs < 60000 ? Math.floor(avgHoldMs / 1000) + "s"
    : avgHoldMs < 3600000 ? Math.floor(avgHoldMs / 60000) + "m"
    : Math.floor(avgHoldMs / 3600000) + "h" + Math.floor((avgHoldMs % 3600000) / 60000) + "m";

  const allRealistic = trips.map(t => t.realisticPnlUsd);

  const summary: AnalysisSummary = {
    totalTrades: trades.length,
    roundTrips: trips.length,
    completedTrips: completed.length,
    openTrips: trips.filter(t => t.isOpen).length,
    idealWins: idealWins.length, idealLosses: idealLosses.length,
    idealWinRate: completed.length > 0 ? (idealWins.length / completed.length) * 100 : 0,
    idealGrossProfit: idealGP, idealGrossLoss: idealGL,
    idealProfitFactor: idealGL > 0 ? idealGP / idealGL : idealGP > 0 ? Infinity : 0,
    idealNetPnl: trips.reduce((s, t) => s + t.idealPnlUsd, 0),
    idealAvgWin: idealWins.length > 0 ? idealGP / idealWins.length : 0,
    idealAvgLoss: idealLosses.length > 0 ? idealGL / idealLosses.length : 0,
    idealEV: completed.length > 0 ? trips.reduce((s, t) => s + t.idealPnlUsd, 0) / completed.length : 0,
    realWins: realWins.length, realLosses: realLosses.length,
    realWinRate: completed.length > 0 ? (realWins.length / completed.length) * 100 : 0,
    realGrossProfit: realGP, realGrossLoss: realGL,
    realProfitFactor: realGL > 0 ? realGP / realGL : realGP > 0 ? Infinity : 0,
    realNetPnl: trips.reduce((s, t) => s + t.realisticPnlUsd, 0),
    realAvgWin: realWins.length > 0 ? realGP / realWins.length : 0,
    realAvgLoss: realLosses.length > 0 ? realGL / realLosses.length : 0,
    realEV: completed.length > 0 ? trips.reduce((s, t) => s + t.realisticPnlUsd, 0) / completed.length : 0,
    conWins: conWins.length, conLosses: conLosses.length,
    conWinRate: completed.length > 0 ? (conWins.length / completed.length) * 100 : 0,
    conNetPnl: trips.reduce((s, t) => s + t.conservPnlUsd, 0),
    conEV: completed.length > 0 ? trips.reduce((s, t) => s + t.conservPnlUsd, 0) / completed.length : 0,
    totalFees: trips.reduce((s, t) => s + t.totalFeesUsd, 0),
    totalSlippage: trips.reduce((s, t) => s + t.slippageCostUsd, 0),
    totalDelay: trips.reduce((s, t) => s + t.delayCostUsd, 0),
    avgHoldTime: avgHoldStr,
    bestTrade: allRealistic.length > 0 ? Math.max(...allRealistic) : 0,
    worstTrade: allRealistic.length > 0 ? Math.min(...allRealistic) : 0,
  };

  return { summary, trips };
}

// ─── Analysis Tab ───────────────────────────────────────────────────────────

function AnalysisTab({ snap, allTrades }: { snap: Snapshot; allTrades: Trade[] }) {
  const { summary: s, trips } = useMemo(
    () => analyzeWallet(allTrades.length > 0 ? allTrades : snap.recentTrades, snap.solPriceUsd || 140, snap.ideal.openPositions),
    [allTrades, snap]
  );

  if (s.totalTrades === 0) return <div className="text-[9px] text-muted-foreground py-2">NO DATA — WAITING FOR TRADES</div>;

  const Metric = ({ label, v, sub, pnl }: { label: string; v: string; sub?: string; pnl?: number }) => (
    <div className="flex items-center justify-between py-[2px] border-b border-border/20 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${pnl != null ? pc(pnl) : ""}`}>{v}{sub ? <span className="text-muted-foreground ml-1 font-normal">{sub}</span> : null}</span>
    </div>
  );

  return (
    <div className="space-y-1">
      {/* Scorecard: 3 scenarios side by side */}
      <div className="text-[9px] text-amber-500 font-bold uppercase py-[2px]">COPY TRADE VIABILITY — WOULD WE PROFIT?</div>

      <div className="grid grid-cols-3 gap-px bg-border/50">
        {/* Ideal */}
        <div className="bg-card p-1.5 text-[10px]">
          <div className="text-[9px] text-blue-400 font-bold mb-1">IDEAL (same price)</div>
          <Metric label="Net P&L" v={`${ps(s.idealNetPnl)}${$(s.idealNetPnl)}`} pnl={s.idealNetPnl} />
          <Metric label="Win Rate" v={`${s.idealWinRate.toFixed(0)}%`} sub={`${s.idealWins}W/${s.idealLosses}L`} />
          <Metric label="Profit Factor" v={s.idealProfitFactor === Infinity ? "INF" : s.idealProfitFactor.toFixed(2)} />
          <Metric label="Avg Win" v={$(s.idealAvgWin)} pnl={s.idealAvgWin} />
          <Metric label="Avg Loss" v={$(s.idealAvgLoss)} pnl={-s.idealAvgLoss} />
          <Metric label="EV/Trade" v={`${ps(s.idealEV)}${$(s.idealEV)}`} pnl={s.idealEV} />
        </div>
        {/* Realistic */}
        <div className="bg-card p-1.5 text-[10px]">
          <div className="text-[9px] text-orange-400 font-bold mb-1">REALISTIC (1-slot delay)</div>
          <Metric label="Net P&L" v={`${ps(s.realNetPnl)}${$(s.realNetPnl)}`} pnl={s.realNetPnl} />
          <Metric label="Win Rate" v={`${s.realWinRate.toFixed(0)}%`} sub={`${s.realWins}W/${s.realLosses}L`} />
          <Metric label="Profit Factor" v={s.realProfitFactor === Infinity ? "INF" : s.realProfitFactor.toFixed(2)} />
          <Metric label="Avg Win" v={$(s.realAvgWin)} pnl={s.realAvgWin} />
          <Metric label="Avg Loss" v={$(s.realAvgLoss)} pnl={-s.realAvgLoss} />
          <Metric label="EV/Trade" v={`${ps(s.realEV)}${$(s.realEV)}`} pnl={s.realEV} />
        </div>
        {/* Conservative */}
        <div className="bg-card p-1.5 text-[10px]">
          <div className="text-[9px] text-red-400 font-bold mb-1">WORST CASE (2-slot delay)</div>
          <Metric label="Net P&L" v={`${ps(s.conNetPnl)}${$(s.conNetPnl)}`} pnl={s.conNetPnl} />
          <Metric label="Win Rate" v={`${s.conWinRate.toFixed(0)}%`} sub={`${s.conWins}W/${s.conLosses}L`} />
          <Metric label="EV/Trade" v={`${ps(s.conEV)}${$(s.conEV)}`} pnl={s.conEV} />
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="grid grid-cols-4 gap-px bg-border/50 text-[10px]">
        <div className="bg-card p-1 text-center">
          <div className="text-muted-foreground text-[9px]">FEES</div>
          <div className="tabular-nums">{$(s.totalFees)}</div>
        </div>
        <div className="bg-card p-1 text-center">
          <div className="text-muted-foreground text-[9px]">SLIPPAGE</div>
          <div className="tabular-nums">{$(s.totalSlippage)}</div>
        </div>
        <div className="bg-card p-1 text-center">
          <div className="text-muted-foreground text-[9px]">DELAY COST</div>
          <div className="tabular-nums">{$(s.totalDelay)}</div>
        </div>
        <div className="bg-card p-1 text-center">
          <div className="text-muted-foreground text-[9px]">AVG HOLD</div>
          <div className="tabular-nums">{s.avgHoldTime}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border/50 text-[10px]">
        <div className="bg-card p-1 text-center">
          <div className="text-muted-foreground text-[9px]">ROUND TRIPS</div>
          <div className="tabular-nums">{s.completedTrips} done / {s.openTrips} open</div>
        </div>
        <div className="bg-card p-1 text-center">
          <div className="text-muted-foreground text-[9px]">BEST TRADE</div>
          <div className={`tabular-nums ${pc(s.bestTrade)}`}>{ps(s.bestTrade)}{$(s.bestTrade)}</div>
        </div>
        <div className="bg-card p-1 text-center">
          <div className="text-muted-foreground text-[9px]">WORST TRADE</div>
          <div className={`tabular-nums ${pc(s.worstTrade)}`}>{ps(s.worstTrade)}{$(s.worstTrade)}</div>
        </div>
      </div>

      {/* Round-trip table */}
      <div className="text-[9px] text-amber-500 font-bold uppercase py-[2px] mt-1">ROUND TRIPS</div>
      <div className="max-h-48 overflow-y-auto">
        <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase sticky top-0 bg-card">
          <span className="w-10 shrink-0 py-[2px]">Status</span>
          <span className="w-14 shrink-0 py-[2px]">Token</span>
          <span className="w-20 shrink-0 py-[2px]">Contract</span>
          <span className="w-10 shrink-0 text-right py-[2px]">Trades</span>
          <span className="flex-1 text-right py-[2px]">Entry MC</span>
          <span className="flex-1 text-right py-[2px]">Our Cost</span>
          <span className="flex-1 text-right py-[2px]">Ideal</span>
          <span className="flex-1 text-right py-[2px]">Real(1s)</span>
          <span className="flex-1 text-right py-[2px]">Worst(2s)</span>
          <span className="flex-1 text-right py-[2px]">Fees</span>
          <span className="w-9 text-right py-[2px]">Hold</span>
        </div>
        {trips.map((t) => (
          <div key={t.mint} className="flex items-center text-[10px] border-b border-border/30 hover:bg-[#141414] transition-colors">
            <span className={`w-10 shrink-0 py-[2px] font-bold ${t.isOpen ? "text-blue-400" : "text-muted-foreground"}`}>
              {t.isOpen ? "OPEN" : "CLSD"}
            </span>
            <span className="w-14 shrink-0 py-[2px] font-medium">{t.symbol}</span>
            <span className="w-20 shrink-0 py-[2px]"><CopyBtn text={t.mint} /></span>
            <span className="w-10 shrink-0 text-right py-[2px] text-muted-foreground tabular-nums">{t.buyCount}B/{t.sellCount}S</span>
            <span className="flex-1 text-right py-[2px] text-muted-foreground tabular-nums">{t.entryMc ? $(t.entryMc) : "-"}</span>
            <span className="flex-1 text-right py-[2px] tabular-nums">{$(t.ourBuyUsd)}</span>
            <span className={`flex-1 text-right py-[2px] tabular-nums font-medium ${pc(t.idealPnlUsd)}`}>
              {ps(t.idealPnlUsd)}{$(t.idealPnlUsd)}
            </span>
            <span className={`flex-1 text-right py-[2px] tabular-nums font-medium ${pc(t.realisticPnlUsd)}`}>
              {ps(t.realisticPnlUsd)}{$(t.realisticPnlUsd)}
            </span>
            <span className={`flex-1 text-right py-[2px] tabular-nums font-medium ${pc(t.conservPnlUsd)}`}>
              {ps(t.conservPnlUsd)}{$(t.conservPnlUsd)}
            </span>
            <span className="flex-1 text-right py-[2px] text-muted-foreground tabular-nums">{$(t.totalFeesUsd)}</span>
            <span className="w-9 text-right py-[2px] text-muted-foreground tabular-nums">
              {t.holdMs < 60000 ? Math.floor(t.holdMs / 1000) + "s" : t.holdMs < 3600000 ? Math.floor(t.holdMs / 60000) + "m" : Math.floor(t.holdMs / 3600000) + "h"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Summary Tab ────────────────────────────────────────────────────────────

function SummaryTab({ snap }: { snap: Snapshot }) {
  const i = snap.ideal, p = snap.pessimistic;
  const Row = ({ label, iv, pv, pnl }: { label: string; iv: string; pv: string; pnl?: [number, number] }) => (
    <div className="flex items-center text-[10px] border-b border-border/30 last:border-0">
      <span className="w-20 shrink-0 text-amber-500/80 py-[2px]">{label}</span>
      <span className={`flex-1 text-right tabular-nums py-[2px] ${pnl ? pc(pnl[0]) : ""}`}>{iv}</span>
      <span className={`flex-1 text-right tabular-nums py-[2px] ${pnl ? pc(pnl[1]) : ""}`}>{pv}</span>
    </div>
  );
  return (
    <div>
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

// ─── Positions Tab ──────────────────────────────────────────────────────────

function PositionsTab({ snap }: { snap: Snapshot }) {
  const ideal = snap.ideal.openPositions, pess = snap.pessimistic;
  if (ideal.length === 0) return <div className="text-[9px] text-muted-foreground py-2">NO OPEN POSITIONS</div>;
  return (
    <div className="max-h-48 overflow-y-auto">
      <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase sticky top-0 bg-card">
        <span className="w-14 shrink-0 py-[2px]">Token</span>
        <span className="w-20 shrink-0 py-[2px]">Contract</span>
        <span className="w-8 shrink-0 py-[2px]">Scn</span>
        <span className="flex-1 text-right py-[2px]">Cost</span>
        <span className="flex-1 text-right py-[2px]">Now</span>
        <span className="flex-1 text-right py-[2px]">P&L</span>
        <span className="w-9 text-right py-[2px]">Age</span>
      </div>
      {ideal.map((pos) => {
        const pp = pess.openPositions.find((x) => x.mint === pos.mint);
        const live = pos.livePriceTime && (Date.now() - pos.livePriceTime) < 300000;
        return (
          <div key={pos.mint}>
            <div className="flex items-center text-[10px] border-b border-border/30 hover:bg-[#141414]">
              <span className="w-14 shrink-0 py-[2px] font-medium flex items-center gap-1">{pos.symbol}{live && <span className="w-1 h-1 bg-green-500 inline-block" />}</span>
              <span className="w-20 shrink-0 py-[2px]"><CopyBtn text={pos.mint} /></span>
              <span className="w-8 shrink-0 py-[2px] text-blue-400">IDL</span>
              <span className="flex-1 text-right tabular-nums py-[2px]">{$(pos.entryUsd)}</span>
              <span className="flex-1 text-right tabular-nums py-[2px]">{$(pos.currentValueUsd)}</span>
              <span className={`flex-1 text-right tabular-nums py-[2px] font-medium ${pc(pos.unrealizedPnl)}`}>{ps(pos.unrealizedPnl)}{$(pos.unrealizedPnl)} ({(pos.unrealizedPnlPct ?? 0).toFixed(1)}%)</span>
              <span className="w-9 text-right text-muted-foreground tabular-nums py-[2px]">{ago(pos.entryTime)}</span>
            </div>
            {pp && (
              <div className="flex items-center text-[10px] border-b border-border/30 hover:bg-[#141414]">
                <span className="w-14 shrink-0 py-[2px]" /><span className="w-20 shrink-0 py-[2px]" />
                <span className="w-8 shrink-0 py-[2px] text-orange-400">PSS</span>
                <span className="flex-1 text-right tabular-nums py-[2px]">{$(pp.entryUsd)}</span>
                <span className="flex-1 text-right tabular-nums py-[2px]">{$(pp.currentValueUsd)}</span>
                <span className={`flex-1 text-right tabular-nums py-[2px] font-medium ${pc(pp.unrealizedPnl)}`}>{ps(pp.unrealizedPnl)}{$(pp.unrealizedPnl)} ({(pp.unrealizedPnlPct ?? 0).toFixed(1)}%)</span>
                <span className="w-9 shrink-0 py-[2px]" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Trades Tab ─────────────────────────────────────────────────────────────

function TradesTab({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <div className="text-[9px] text-muted-foreground py-2">NO TRADES YET</div>;
  return (
    <div className="max-h-56 overflow-y-auto">
      <div className="flex items-center text-[9px] text-muted-foreground border-b border-border uppercase sticky top-0 bg-card">
        <span className="w-6 shrink-0 py-[2px]">S</span>
        <span className="w-14 shrink-0 py-[2px]">Token</span>
        <span className="w-20 shrink-0 py-[2px]">Contract</span>
        <span className="flex-1 text-right py-[2px]">Vol</span>
        <span className="flex-1 text-right py-[2px]">MC</span>
        <span className="w-10 text-right py-[2px]">Imp%</span>
        <span className="w-10 text-right py-[2px]">Fee</span>
        <span className="flex-1 text-right py-[2px]">Ideal</span>
        <span className="flex-1 text-right py-[2px]">Pess</span>
        <span className="w-6 text-right py-[2px]">Tx</span>
        <span className="w-9 text-right py-[2px]">Age</span>
      </div>
      {trades.map((t, i) => (
        <div key={t.originalTx || i} className="flex items-center text-[10px] border-b border-border/30 hover:bg-[#141414]">
          <span className={`w-6 shrink-0 py-[2px] font-bold ${t.type === "buy" ? "text-green-500" : "text-red-500"}`}>{t.type === "buy" ? "B" : "S"}</span>
          <span className="w-14 shrink-0 py-[2px] font-medium">{t.tokenSymbol}</span>
          <span className="w-20 shrink-0 py-[2px]"><CopyBtn text={t.tokenMint} /></span>
          <span className="flex-1 text-right tabular-nums py-[2px]">{$(t.walletUsdVolume)}</span>
          <span className="flex-1 text-right tabular-nums py-[2px] text-muted-foreground">{t.mcUsd ? $(t.mcUsd) : "-"}</span>
          <span className="w-10 text-right tabular-nums py-[2px] text-muted-foreground">{(t.priceImpact ?? 0).toFixed(2)}%</span>
          <span className="w-10 text-right tabular-nums py-[2px] text-muted-foreground">{$(t.feeUsd)}</span>
          <span className={`flex-1 text-right tabular-nums py-[2px] ${pc(t.idealTradePnl ?? t.idealPnl)}`}>{ps(t.idealTradePnl ?? t.idealPnl)}{$(t.idealTradePnl ?? t.idealPnl)}</span>
          <span className={`flex-1 text-right tabular-nums py-[2px] ${pc(t.pessTradePnl ?? t.pessPnl)}`}>{ps(t.pessTradePnl ?? t.pessPnl)}{$(t.pessTradePnl ?? t.pessPnl)}</span>
          <span className="w-6 text-right py-[2px]"><TxLink tx={t.originalTx} /></span>
          <span className="w-9 text-right text-muted-foreground tabular-nums py-[2px]">{ago(t.time)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Wallet Panel ───────────────────────────────────────────────────────────

type Tab = "analysis" | "summary" | "positions" | "trades";

function WalletPanel({ traderId }: { traderId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [tab, setTab] = useState<Tab>("analysis");

  useEffect(() => {
    // Fetch snapshot
    fetch(`/api/paper/${traderId}/snapshot`).then(r => r.json()).then(setSnap).catch(() => {});
    // Fetch all trades for analysis
    fetch(`/api/paper/${traderId}/trades`).then(r => r.json()).then(d => {
      if (d.trades) setAllTrades(d.trades);
    }).catch(() => {});

    const es = new EventSource(`/api/paper/${traderId}/stream`);
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "snapshot" || d.type === "trade") {
          const s = d.type === "trade" ? d.state : d;
          setSnap(s);
          // Also update allTrades with latest recentTrades
          if (d.type === "trade" && d.trade) {
            setAllTrades(prev => [d.trade, ...prev].slice(0, 500));
          }
        }
      } catch {}
    };
    return () => es.close();
  }, [traderId]);

  if (!snap) return <div className="p-2 text-[9px] text-muted-foreground">LOADING {traderId.toUpperCase()}...</div>;

  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "analysis", label: "ANALYSIS" },
    { key: "summary", label: "SUM" },
    { key: "positions", label: "POS", n: snap.ideal.openPositions.length },
    { key: "trades", label: "TRD", n: snap.tradeCount },
  ];

  const i = snap.ideal;
  const tradesToShow = allTrades.length > 0 ? allTrades : snap.recentTrades;

  return (
    <div className="flex flex-col min-w-0 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-[3px] border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 font-bold text-[10px]">{snap.walletLabel.toUpperCase()}</span>
          <span className={`font-bold text-[10px] tabular-nums ${pc(i.totalPnl)}`}>
            {ps(i.totalPnl)}{$(i.totalPnl)} ({(i.totalPnlPct ?? 0).toFixed(1)}%)
          </span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground tabular-nums">
          <span>{snap.tradeCount}trd</span>
          <span>fee:{$(snap.totalFeesUsd)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card shrink-0">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-2 py-[3px] text-[9px] font-medium border-r border-border last:border-r-0 transition-colors ${
              tab === t.key ? "bg-amber-500/10 text-amber-500" : "text-muted-foreground hover:text-foreground hover:bg-[#141414]"
            }`}>
            {t.label}{t.n != null && t.n > 0 ? ` ${t.n}` : ""}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "analysis" && <AnalysisTab snap={snap} allTrades={tradesToShow} />}
        {tab === "summary" && <SummaryTab snap={snap} />}
        {tab === "positions" && <PositionsTab snap={snap} />}
        {tab === "trades" && <TradesTab trades={tradesToShow} />}
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function PaperDashboard() {
  const [selected, setSelected] = useState(TRADERS[0].id);

  return (
    <div className="shrink-0 flex flex-col" style={{ height: "50vh" }}>
      {/* Wallet tabs */}
      <div className="flex items-center border-b border-border bg-card shrink-0">
        <span className="text-[9px] text-amber-500 font-bold px-2">PAPER</span>
        <div className="flex overflow-x-auto">
          {TRADERS.map((t) => (
            <button key={t.id} onClick={() => setSelected(t.id)}
              className={`px-3 py-[4px] text-[10px] font-medium border-r border-border transition-colors whitespace-nowrap ${
                selected === t.id ? "bg-amber-500/10 text-amber-500 border-b-2 border-b-amber-500" : "text-muted-foreground hover:text-foreground hover:bg-[#141414]"
              }`}>
              {t.label}
            </button>
          ))}
          <span className="px-2 py-[4px] text-[9px] text-muted-foreground">$2K/$200</span>
        </div>
      </div>

      {/* Selected wallet panel */}
      <div className="flex-1 overflow-hidden">
        <WalletPanel key={selected} traderId={selected} />
      </div>
    </div>
  );
}
