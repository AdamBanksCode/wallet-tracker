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
  return <span>{Math.floor(age / 60)}m{age % 60}s ago</span>;
}

function computeMcap(swap: Swap): number | null {
  const isBuy = swap.type === "buy";
  const tokenSide = isBuy ? swap.to : swap.from;
  const token = tokenSide.token;
  if (!token.price?.usd || token.price.usd <= 0) return null;
  // Standard supply for SPL tokens: 10^decimals (most memecoins use 1B supply with 6 decimals)
  const supply = token.decimals <= 9 ? Math.pow(10, token.decimals) : 1e9;
  return token.price.usd * supply;
}

function SwapCard({ swap }: { swap: Swap }) {
  const isBuy = swap.type === "buy";
  const solSide = isBuy ? swap.from : swap.to;
  const tokenSide = isBuy ? swap.to : swap.from;
  const token = tokenSide.token;
  const solAmount = solSide.amount;
  const mcap = computeMcap(swap);

  return (
    <div
      className={`border-l-2 rounded-md bg-card px-3 py-2 text-xs animate-in fade-in slide-in-from-top-1 duration-200 ${
        isBuy ? "border-l-green-500" : "border-l-red-500"
      }`}
    >
      {/* Row 1: Direction + Token + Volume + Age */}
      <div className="flex items-center gap-1.5">
        <span
          className={`font-bold text-[10px] px-1 py-0.5 rounded ${
            isBuy
              ? "bg-green-500/15 text-green-500"
              : "bg-red-500/15 text-red-500"
          }`}
        >
          {isBuy ? "BUY" : "SELL"}
        </span>
        {token.image && (
          <img
            src={token.image}
            alt=""
            className="w-4 h-4 rounded-full"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <span className="font-bold truncate">{token.name}</span>
        <span className="text-muted-foreground">{token.symbol}</span>
        <span className="ml-auto text-green-500 font-semibold">
          {formatUsd(swap.volume.usd)}
        </span>
        <span className="text-muted-foreground">
          <AgeCounter detectedAt={swap.time} />
        </span>
      </div>

      {/* Row 2: Contract address */}
      <code className="text-[9px] text-amber-500 dark:text-amber-400 select-all cursor-pointer block mt-1 truncate">
        {token.address}
      </code>

      {/* Row 3: Swap details inline */}
      <div className="flex items-center gap-3 mt-1.5 text-muted-foreground flex-wrap">
        <span>
          {isBuy ? "Spent " : "Sold "}
          <span className="text-foreground font-medium">
            {isBuy
              ? formatSol(solAmount)
              : formatAmount(swap.from.amount) + " " + swap.from.token.symbol}
          </span>
        </span>
        <span>
          {"Got "}
          <span className="text-foreground font-medium">
            {isBuy
              ? formatAmount(swap.to.amount) + " " + swap.to.token.symbol
              : formatSol(solAmount)}
          </span>
        </span>
        <span>
          {"@ "}
          <span className="text-foreground font-medium">
            {formatUsd(swap.price.usd)}
          </span>
        </span>
        {mcap && (
          <span>
            {"MC "}
            <span className="text-foreground font-medium">
              {formatUsd(mcap)}
            </span>
          </span>
        )}
        <span className="text-[10px]">{swap.program}</span>
      </div>

      {/* Row 4: Tx link */}
      <div className="flex items-center justify-between mt-1 text-[9px] text-muted-foreground">
        <a
          href={`https://solscan.io/tx/${swap.tx}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors truncate"
          title={swap.tx}
        >
          {swap.tx.slice(0, 24)}...
        </a>
        <span>{formatSol(swap.volume.sol)} vol</span>
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
          if (data === "ping" || data.type === "connected") return;

          const swap: Swap = data;
          if (!swap.tx || seenTxs.has(swap.tx)) return;
          seenTxs.add(swap.tx);
          if (seenTxs.size > 200) seenTxs.clear();

          setSwaps((prev) => [swap, ...prev].slice(0, 50));
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
    <div className="space-y-1.5" ref={scrollRef}>
      {/* Status bar */}
      <div className="flex items-center justify-between text-[10px] pb-1">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              connected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className="text-muted-foreground">
            {connected ? "Live" : "Reconnecting..."}
          </span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span>Trades: {stats.total}</span>
          <span>Vol: {formatUsd(stats.totalVolume)}</span>
        </div>
      </div>

      {swaps.length === 0 && (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Waiting for trades...
        </div>
      )}
      {swaps.map((swap) => (
        <SwapCard key={swap.tx} swap={swap} />
      ))}
    </div>
  );
}
