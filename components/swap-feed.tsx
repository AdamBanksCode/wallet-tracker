"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
  if (val >= 1000) return "$" + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (val >= 1) return "$" + val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return "$" + val.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatAmount(val: number): string {
  if (val >= 1_000_000) return (val / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "M";
  if (val >= 1_000) return (val / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + "K";
  return val.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatSol(val: number): string {
  return val.toLocaleString(undefined, { maximumFractionDigits: 4 }) + " SOL";
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

function AgeCounter({ detectedAt }: { detectedAt: number }) {
  const [age, setAge] = useState(0);
  useEffect(() => {
    const update = () => setAge(Math.floor((Date.now() - detectedAt) / 1000));
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [detectedAt]);
  if (age < 60) return <span>{age}s</span>;
  return <span>{Math.floor(age / 60)}m{age % 60}s</span>;
}

function SwapCard({ swap }: { swap: Swap }) {
  const isBuy = swap.type === "buy";
  const solSide = isBuy ? swap.from : swap.to;
  const tokenSide = isBuy ? swap.to : swap.from;
  const token = tokenSide.token;
  const solAmount = solSide.amount;

  return (
    <Card
      className="border-l-4 transition-all duration-300 animate-in fade-in slide-in-from-top-2"
      style={{ borderLeftColor: isBuy ? "var(--color-chart-2)" : "var(--color-destructive)" }}
    >
      <CardContent className="p-4 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={isBuy ? "default" : "destructive"} className="text-xs font-bold">
              {isBuy ? "BUY" : "SELL"}
            </Badge>
            <span className="text-xs text-muted-foreground">{swap.program}</span>
            <span className="text-xs font-semibold text-green-500">{formatUsd(swap.volume.usd)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTime(swap.time)}</span>
            <AgeCounter detectedAt={swap.time} />
          </div>
        </div>

        {/* Token info */}
        <div className="flex items-center gap-2">
          {token.image && (
            <img
              src={token.image}
              alt={token.symbol}
              className="w-5 h-5 rounded-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <span className="text-sm font-bold">{token.name}</span>
          <span className="text-xs text-muted-foreground">{token.symbol}</span>
        </div>

        {/* Contract address */}
        <code className="text-[10px] text-amber-500 dark:text-amber-400 break-all select-all cursor-pointer block">
          {token.address}
        </code>

        <Separator />

        {/* Swap details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div>
            <span className="text-muted-foreground">{isBuy ? "Spent: " : "Sold: "}</span>
            <span className="font-semibold">
              {isBuy ? formatSol(solAmount) : formatAmount(swap.from.amount) + " " + swap.from.token.symbol}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">{isBuy ? "Got: " : "Got: "}</span>
            <span className="font-semibold">
              {isBuy ? formatAmount(swap.to.amount) + " " + swap.to.token.symbol : formatSol(solAmount)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Price: </span>
            <span className="font-medium">{formatUsd(swap.price.usd)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">MCap: </span>
            <span className="font-medium">
              {token.price?.usd
                ? formatUsd(token.price.usd * (10 ** token.decimals > 1e9 ? 1e9 : 10 ** token.decimals))
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Volume: </span>
            <span className="font-medium">{formatSol(swap.volume.sol)}</span>
          </div>
          {swap.pools[0] && (
            <div>
              <span className="text-muted-foreground">Pool: </span>
              <span className="font-medium truncate" title={swap.pools[0]}>
                {swap.pools[0].slice(0, 8)}...
              </span>
            </div>
          )}
        </div>

        {/* Signature */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
          <a
            href={`https://solscan.io/tx/${swap.tx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors truncate max-w-[240px]"
            title={swap.tx}
          >
            {swap.tx.slice(0, 32)}...
          </a>
          <span className="font-medium text-foreground">
            <AgeCounter detectedAt={swap.time} /> ago
          </span>
        </div>
      </CardContent>
    </Card>
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

          // Skip pings and connection messages
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
    <div className="space-y-3" ref={scrollRef}>
      {/* Status bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className="text-muted-foreground">
            {connected ? "Live — SolanaTracker DataStream" : "Reconnecting..."}
          </span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>Trades: {stats.total}</span>
          <span>Vol: {formatUsd(stats.totalVolume)}</span>
        </div>
      </div>

      {/* Trade list */}
      {swaps.length === 0 && (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Waiting for trades from tracked wallets...
        </div>
      )}
      {swaps.map((swap) => (
        <SwapCard key={swap.tx} swap={swap} />
      ))}
    </div>
  );
}
