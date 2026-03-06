export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRIDGE_URL = process.env.DECODER_URL || "http://20.52.113.255:9109";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;
  try {
    const resp = await fetch(`${BRIDGE_URL}/api/analysis/${wallet}`, {
      cache: "no-store",
    });
    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: "no data for " + wallet }),
        { status: resp.status, headers: { "Content-Type": "application/json" } }
      );
    }
    const data = await resp.json();
    return Response.json(data);
  } catch {
    return new Response(
      JSON.stringify({ error: "bridge unavailable" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
