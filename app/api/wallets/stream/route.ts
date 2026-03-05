export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ST_KEY = process.env.ST_KEY || "a57eb7e3-40c3-4931-9624-edcab89fca97";
const WALLETS = (
  process.env.WALLETS || "7BNaxx6KdUYrjACNQZ9He26NBFoFxujQMAfNLnArLGH5"
)
  .split(",")
  .map((w) => w.trim());
const ST_WS = `wss://datastream.solanatracker.io/${ST_KEY}`;

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const { default: WebSocket } = await import("ws");

      function send(data: string) {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Stream closed
        }
      }

      let ws: InstanceType<typeof WebSocket> | null = null;
      let closed = false;

      function connect() {
        if (closed) return;
        ws = new WebSocket(ST_WS);

        ws.on("open", () => {
          for (const wallet of WALLETS) {
            ws!.send(JSON.stringify({ type: "join", room: `wallet:${wallet}` }));
          }
          send(JSON.stringify({ type: "connected", wallets: WALLETS }));
        });

        ws.on("message", (raw: Buffer) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "message" && msg.data) {
              send(JSON.stringify(msg.data));
            }
          } catch {}
        });

        ws.on("close", () => {
          if (!closed) setTimeout(connect, 3000);
        });

        ws.on("error", () => {
          ws?.close();
        });
      }

      connect();

      // Keep-alive ping every 15s
      const interval = setInterval(() => send('"ping"'), 15000);

      // Cleanup when stream is cancelled
      const checkClosed = setInterval(() => {
        if (controller.desiredSize === null || controller.desiredSize < 0) {
          closed = true;
          ws?.close();
          clearInterval(interval);
          clearInterval(checkClosed);
        }
      }, 5000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
