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
  from: { address: string; amount: number; token: TokenInfo };
  to: { address: string; amount: number; token: TokenInfo };
  volume: { usd: number; sol: number };
  price: { usd: number };
  pools: string[];
}

const WALLET_LABELS: Record<string, string> = {
  DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm: "gake",
  "2T5NgDDidkvhJQg8AHDi74uCFwgp25pYFMRZXBaCUNBH": "IDPT",
  DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt: "Doc",
};

function fU(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.0001) return v.toFixed(4);
  return v.toExponential(2);
}

function fA(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function Age({ t }: { t: number }) {
  const [a, setA] = useState(0);
  useEffect(() => {
    const u = () => setA(Math.floor((Date.now() - t) / 1000));
    u();
    const iv = setInterval(u, 1000);
    return () => clearInterval(iv);
  }, [t]);
  if (a < 60) return <>{a}s</>;
  if (a < 3600) return <>{Math.floor(a / 60)}m{a % 60}s</>;
  return <>{Math.floor(a / 3600)}h{Math.floor((a % 3600) / 60)}m</>;
}

function SwapRow({ swap }: { swap: Swap }) {
  const isBuy = swap.type === "buy";
  const tokenSide = isBuy ? swap.to : swap.from;
  const token = tokenSide.token;
  const solAmt = isBuy ? swap.from.amount : swap.to.amount;
  const mcap = token.price?.usd ? token.price.usd * 1e9 : null;
  const wallet = WALLET_LABELS[swap.wallet] || swap.wallet.slice(0, 4);
  const [cp, setCp] = useState(false);

  return (
    <div className="flex items-center gap-0 px-2 py-[3px] text-[10px] border-b border-border/50 hover:bg-[#141414] transition-colors">
      <span className={`w-7 shrink-0 font-bold ${isBuy ? "text-green-500" : "text-red-500"}`}>{isBuy ? "BUY" : "SELL"}</span>
      <span className="w-9 shrink-0 text-amber-500">{wallet}</span>
      <span className="w-20 shrink-0 truncate font-medium text-foreground">{token.symbol}</span>
      <span className="w-14 shrink-0 text-right tabular-nums">${fU(swap.volume.usd)}</span>
      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{solAmt.toFixed(3)}</span>
      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fA(isBuy ? swap.to.amount : swap.from.amount)}</span>
      <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{mcap ? "$" + fU(mcap) : "-"}</span>
      <button onClick={() => { navigator.clipboard.writeText(token.address); setCp(true); setTimeout(() => setCp(false), 1000); }}
        className="w-[72px] shrink-0 text-right text-amber-500/60 hover:text-amber-500 transition-colors truncate" title={token.address}>
        {cp ? "COPIED" : token.address.slice(0, 4) + ".." + token.address.slice(-4)}
      </button>
      <a href={`https://solscan.io/tx/${swap.tx}`} target="_blank" rel="noopener noreferrer"
        className="w-12 shrink-0 text-right text-cyan-600 hover:text-cyan-400 transition-colors">{swap.tx.slice(0, 6)}..</a>
      <span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums"><Age t={swap.time} /></span>
    </div>
  );
}

export default function SwapFeed() {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState({ total: 0, vol: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    const seen = new Set<string>();
    function connect() {
      es = new EventSource("/api/wallets/stream");
      es.onopen = () => setConnected(true);
      es.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (d === "ping" || d.type === "connected") return;
          if (d.type === "history" && Array.isArray(d.swaps)) {
            const h: Swap[] = [];
            let v = 0;
            for (const s of d.swaps) { if (s.tx && !seen.has(s.tx)) { seen.add(s.tx); h.push(s); v += s.volume?.usd || 0; } }
            if (h.length > 0) {
              setSwaps((p) => { const m = [...p]; for (const s of h) { if (!m.some((x) => x.tx === s.tx)) m.push(s); } m.sort((a, b) => b.time - a.time); return m.slice(0, 200); });
              setStats((p) => ({ total: p.total + h.length, vol: p.vol + v }));
            }
            return;
          }
          const swap: Swap = d;
          if (!swap.tx || seen.has(swap.tx)) return;
          seen.add(swap.tx);
          if (seen.size > 500) seen.clear();
          setSwaps((p) => [swap, ...p].slice(0, 200));
          setStats((p) => ({ total: p.total + 1, vol: p.vol + (swap.volume?.usd || 0) }));
        } catch {}
      };
      es.onerror = () => { setConnected(false); es?.close(); setTimeout(connect, 3000); };
    }
    connect();
    return () => es?.close();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0 px-2 py-[2px] text-[9px] text-muted-foreground border-b border-border bg-card shrink-0 uppercase">
        <span className="w-7 shrink-0">Side</span>
        <span className="w-9 shrink-0">Who</span>
        <span className="w-20 shrink-0">Token</span>
        <span className="w-14 shrink-0 text-right">Vol$</span>
        <span className="w-14 shrink-0 text-right">SOL</span>
        <span className="w-14 shrink-0 text-right">Tokens</span>
        <span className="w-14 shrink-0 text-right">MC</span>
        <span className="w-[72px] shrink-0 text-right">Contract</span>
        <span className="w-12 shrink-0 text-right">Tx</span>
        <span className="w-9 shrink-0 text-right">Age</span>
      </div>
      <div className="flex items-center justify-between px-2 py-[2px] text-[9px] border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className={connected ? "text-green-600" : "text-red-500"}>{connected ? "CONNECTED" : "RECONNECTING"}</span>
        </div>
        <div className="flex items-center gap-3 text-muted-foreground tabular-nums">
          <span>TRADES:{stats.total}</span>
          <span>VOL:${fU(stats.vol)}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" ref={ref}>
        {swaps.length === 0 && <div className="text-center text-muted-foreground py-8 text-[10px]">WAITING FOR TRADES...</div>}
        {swaps.map((s) => <SwapRow key={s.tx} swap={s} />)}
      </div>
    </div>
  );
}
