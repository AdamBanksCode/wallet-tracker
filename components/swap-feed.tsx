"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const SOL_MINT = "So11111111111111111111111111111111111111112";

interface Swap {
  signature: string;
  slot: number;
  program: string;
  signer: string;
  direction: string;
  token_in_mint: string | null;
  token_out_mint: string | null;
  amount_in: number | null;
  amount_out: number | null;
  pool: string | null;
  priority_fee_micro_lamports: number | null;
  tip_lamports: number | null;
  tip_provider: string | null;
  detected_at_ms: number;
  tracked_at_ms: number;
  decode_to_track_ms: number;
  slots_ahead: number;
  estimated_ahead_ms: number;
  amounts_from_inner: boolean;
}

function tokenMint(swap: Swap): string {
  const tin = swap.token_in_mint;
  const tout = swap.token_out_mint;
  if (tin === SOL_MINT && tout) return tout;
  if (tout === SOL_MINT && tin) return tin;
  if (tin && tout) return `${tin} → ${tout}`;
  return tin || tout || "unknown";
}

function formatAmount(val: number | null, mint: string | null): string {
  if (val === null) return "—";
  // SOL uses 9 decimals, most SPL tokens use 6
  if (mint === SOL_MINT) {
    return (val / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 }) + " SOL";
  }
  // For SPL tokens, assume 6 decimals (pump tokens, most memecoins)
  if (val > 1e9) {
    return (val / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return val.toLocaleString();
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
  return (
    <span>
      {Math.floor(age / 60)}m{age % 60}s
    </span>
  );
}

function SwapCard({ swap }: { swap: Swap }) {
  const isBuy = swap.direction.toLowerCase() === "buy";
  const token = tokenMint(swap);

  return (
    <Card className="border-l-4 transition-all duration-300 animate-in fade-in slide-in-from-top-2"
      style={{ borderLeftColor: isBuy ? "var(--color-chart-2)" : "var(--color-destructive)" }}>
      <CardContent className="p-4 space-y-2">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={isBuy ? "default" : "destructive"} className="text-xs font-bold">
              {isBuy ? "▲ BUY" : "▼ SELL"}
            </Badge>
            <span className="text-xs text-muted-foreground">{swap.program}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatTime(swap.detected_at_ms)}</span>
            <span className="text-green-500 font-medium">
              ~{swap.estimated_ahead_ms}ms ahead
            </span>
          </div>
        </div>

        {/* Token address */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Token:</span>
          <code className="text-xs font-bold text-amber-500 dark:text-amber-400 break-all select-all cursor-pointer">
            {token}
          </code>
        </div>

        <Separator />

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">In: </span>
            <span className="font-medium">{formatAmount(swap.amount_in, swap.token_in_mint)}</span>
            {swap.amounts_from_inner && <span className="text-green-500 ml-1" title="Verified on-chain">✓</span>}
          </div>
          <div>
            <span className="text-muted-foreground">Out: </span>
            <span className="font-medium">{formatAmount(swap.amount_out, swap.token_out_mint)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Slot: </span>
            <span className="font-medium">{swap.slot}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Latency: </span>
            <span className="font-medium">{swap.decode_to_track_ms}ms</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate max-w-[200px]" title={swap.signature}>
            Sig: {swap.signature.slice(0, 24)}...
          </span>
          <span className="font-medium text-foreground">
            Age: <AgeCounter detectedAt={swap.detected_at_ms} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SwapFeed() {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState({ total: 0, avgLatency: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    const seenSigs = new Set<string>();

    function connect() {
      es = new EventSource("/api/wallets/stream");
      es.onopen = () => setConnected(true);
      es.onmessage = (ev) => {
        try {
          const swap: Swap = JSON.parse(ev.data);
          if (seenSigs.has(swap.signature)) {
            // Enrichment update — replace existing swap with updated data
            if (swap.amounts_from_inner) {
              setSwaps((prev) =>
                prev.map((s) => (s.signature === swap.signature ? swap : s))
              );
            }
            return;
          }
          seenSigs.add(swap.signature);
          if (seenSigs.size > 200) seenSigs.clear();
          setSwaps((prev) => [swap, ...prev].slice(0, 50));
          setStats((prev) => ({
            total: prev.total + 1,
            avgLatency: Math.round(
              (prev.avgLatency * prev.total + swap.decode_to_track_ms) /
                (prev.total + 1)
            ),
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
      {/* Connection status */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className="text-muted-foreground">
            {connected ? "Connected to shred decoder" : "Reconnecting..."}
          </span>
        </div>
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>Swaps: {stats.total}</span>
          <span>Avg: {stats.avgLatency}ms</span>
        </div>
      </div>

      {/* Swap list */}
      {swaps.length === 0 && (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Waiting for swaps from tracked wallets...
        </div>
      )}
      {swaps.map((swap) => (
        <SwapCard key={swap.signature} swap={swap} />
      ))}
    </div>
  );
}
