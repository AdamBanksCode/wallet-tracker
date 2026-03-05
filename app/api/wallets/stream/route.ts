export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECODER_URL =
  process.env.DECODER_URL || "http://20.52.113.255:9110";

export async function GET() {
  const upstream = `${DECODER_URL}/v1/wallets/stream`;

  const resp = await fetch(upstream, {
    headers: { Accept: "text/event-stream" },
    cache: "no-store",
  });

  if (!resp.ok || !resp.body) {
    return new Response("upstream unavailable", { status: 502 });
  }

  return new Response(resp.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
