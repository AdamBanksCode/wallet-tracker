export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECODER_URL = process.env.DECODER_URL || "http://localhost:9109";

export async function GET() {
  const upstream = await fetch(`${DECODER_URL}/v1/wallets/stream`, {
    headers: { Accept: "text/event-stream" },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("upstream unavailable", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
