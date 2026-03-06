"use client";

import { useEffect, useRef, useState } from "react";

interface TokenInfo {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  amount: number;
  image?: string;
  price?: { usd: number };
}

interface Swap {
  tx: string;
  type: string;
  wallet: string;
  program: string;
  time: number;
  from: {
    address: string;
    amount: number;
    token: TokenInfo;
  };
  to: {
    address: string;
    amount: number;
    token: TokenInfo;
  };
  volume: { usd: number; sol: number };
  price: { usd: number };
  pools: string[];
}

const WALLET_LABELS: Record<string, { label: string; color: string }> = {
  DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm: {
    label: "gake",
    color: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  },
  "2T5NgDDidkvhJQg8AHDi74uCFwgp25pYFMRZXBaCUNBH": {
    label: "IDontPayTaxes",
    color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  },
};

function formatUsd(val: number): string {
  if (val >= 1_000_000_000) return "$" + (val / 1_000_000_000).toFixed(2) + "B";
  if (val >= 1_000_000) return "$" + (val / 1_000_000).toFixed(2) + "M";
  if (val >= 1_000) return "$" + (val / 1_000).toFixed(2) + "K";
  if (val >= 1) return "$" + val.toFixed(2);
  if (val >= 0.0001) return "$" + val.toFixed(4);
  return "$" + val.toExponential(2);
}

function formatAmount(val: number): string {
  if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(2) + "B";
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + "M";
  if (val >= 1_000) return (val / 1_000).toFixed(2) + "K";
  if (val >= 1) return val.toFixed(2);
  return val.toFixed(4);
}

function formatSol(val: number): string {
  return val.toFixed(4) + " SOL";
}

function AgeCounter({ detectedAt }: { detectedAt: number }) {
  const [age, setAge] = useState(0);
  useEffect(() => {
    const update = () => setAge(Math.floor((Date.now() - detectedAt) / 1000));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [detectedAt]);
  if (age < 60) return <span>{age}s ago</span>;
  if (age < 3600) return <span>{Math.floor(age / 60)}m{age % 60}s ago</span>;
  return <span>{Math.floor(age / 3600)}h{Math.floor((age % 3600) / 60)}m ago</span>;
}

function computeMcap(swap: Swap): number | null {
  const isBuy = swap.type === "buy";
  const tokenSide = isBuy ? swap.to : swap.from;
  const token = tokenSide.token;
  if (!token.price?.usd || token.price.usd <= 0) return null;
  return token.price.usd * 1_000_000_000;
}

function CopyMint({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="text-[9px] text-amber-500/80 dark:text-amber-400/80 hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer truncate max-w-[260px]"
      title={address}
    >
      {copied ? "Copied!" : address}
    </button>
  );
}

function SwapCard({ swap }: { swap: Swap }) {
  const isBuy = swap.type === "buy";
  const solSide = isBuy ? swap.from : swap.to;
  const tokenSide = isBuy ? swap.to : swap.from;
  const token = tokenSide.token;
  const solAmount = solSide.amount;
  const mcap = computeMcap(swap);
  const walletInfo = WALLET_LABELS[swap.wallet];

  return (
    <div
      className={`rounded-lg border bg-card px-3.5 py-2.5 text-xs transition-colors hover:bg-accent/30 ${
        isBuy ? "border-green-500/20" : "border-red-500/20"
      }`}
    >
      {/* Row 1: Direction badge + Wallet badge + Token + Volume + Age */}
      <div className="flex items-center gap-1.5">
        <span
          className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${
            isBuy
              ? "bg-green-500/15 text-green-500"
              : "bg-red-500/15 text-red-500"
          }`}
        >
          {isBuy ? "BUY" : "SELL"}
        </span>
        {walletInfo && (
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${walletInfo.color}`}>
            {walletInfo.label}
          </span>
        )}
        {token.image && (
          <img
            src={token.image}
            alt=""
            className="w-4 h-4 rounded-full ring-1 ring-border"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <span className="font-bold truncate">{token.name}</span>
        <span className="text-muted-foreground text-[10px]">{token.symbol}</span>
        <span className="ml-auto font-semibold tabular-nums">
          {formatUsd(swap.volume.usd)}
        </span>
        <span className="text-muted-foreground text-[10px]">
          <AgeCounter detectedAt={swap.time} />
        </span>
      </div>

      {/* Row 2: Contract address (clickable to copy) */}
      <div className="mt-1">
        <CopyMint address={token.address} />
      </div>

      {/* Row 3: Swap details */}
      <div className="flex items-center gap-3 mt-1.5 text-muted-foreground flex-wrap">
        <span>
          {isBuy ? "Spent " : "Sold "}
          <span className="text-foreground font-medium tabular-nums">
            {isBuy
              ? formatSol(solAmount)
              : formatAmount(swap.from.amount) + " " + swap.from.token.symbol}
          </span>
        </span>
        <span className="text-border">|</span>
        <span>
          {"Got "}
          <span className="text-foreground font-medium tabular-nums">
            {isBuy
              ? formatAmount(swap.to.amount) + " " + swap.to.token.symbol
              : formatSol(solAmount)}
          </span>
        </span>
        {mcap != null && (
          <>
            <span className="text-border">|</span>
            <span>
              {"MC "}
              <span className="text-foreground font-medium tabular-nums">
                {formatUsd(mcap)}
              </span>
            </span>
          </>
        )}
      </div>

      {/* Row 4: Tx + program + vol */}
      <div className="flex items-center justify-between mt-1.5 text-[9px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <a
            href={`https://solscan.io/tx/${swap.tx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors truncate"
            title={swap.tx}
          >
            {swap.tx.slice(0, 20)}...
          </a>
          <span className="opacity-60">{swap.program}</span>
        </div>
        <span className="tabular-nums">{formatSol(swap.volume.sol)} vol</span>
      </div>
    </div>
  );
}

export default function SwapFeed() {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState({ total: 0, totalVolume: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    const seenTxs = new Set<string>();

    function connect() {
      es = new EventSource("/api/wallets/stream");
      es.onopen = () => setConnected(true);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data === "ping") return;

          if (data.type === "connected") return;

          if (data.type === "history" && Array.isArray(data.swaps)) {
            const historySwaps: Swap[] = [];
            let vol = 0;
            for (const swap of data.swaps) {
              if (swap.tx && !seenTxs.has(swap.tx)) {
                seenTxs.add(swap.tx);
                historySwaps.push(swap);
                vol += swap.volume?.usd || 0;
              }
            }
            if (historySwaps.length > 0) {
              setSwaps((prev) => {
                const merged = [...prev];
                for (const s of historySwaps) {
                  if (!merged.some((m) => m.tx === s.tx)) merged.push(s);
                }
                merged.sort((a, b) => b.time - a.time);
                return merged.slice(0, 100);
              });
              setStats((prev) => ({
                total: prev.total + historySwaps.length,
                totalVolume: prev.totalVolume + vol,
              }));
            }
            return;
          }

          const swap: Swap = data;
          if (!swap.tx || seenTxs.has(swap.tx)) return;
          seenTxs.add(swap.tx);
          if (seenTxs.size > 500) seenTxs.clear();

          setSwaps((prev) => [swap, ...prev].slice(0, 100));
          setStats((prev) => ({
            total: prev.total + 1,
            totalVolume: prev.totalVolume + (swap.volume?.usd || 0),
          }));
        } catch {}
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        setTimeout(connect, 3000);
      };
    }

    connect();
    return () => es?.close();
  }, []);

  return (
    <div className="space-y-2" ref={scrollRef}>
      {/* Status bar */}
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-red-500"
              }`}
            />
            <span className={connected ? "text-green-500/80" : "text-red-500/80"}>
              {connected ? "Connected" : "Reconnecting..."}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
          <span>{stats.total} trades</span>
          <span className="text-border">|</span>
          <span>{formatUsd(stats.totalVolume)} vol</span>
        </div>
      </div>

      {swaps.length === 0 && (
        <div className="text-center text-muted-foreground py-16 text-sm border border-dashed border-border rounded-lg">
          Waiting for trades...
        </div>
      )}
      {swaps.map((swap) => (
        <SwapCard key={swap.tx} swap={swap} />
      ))}
    </div>
  );
}
