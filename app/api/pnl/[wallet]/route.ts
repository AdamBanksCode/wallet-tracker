export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ST_API_KEY = process.env.ST_DATA_KEY || "8f4e3105-55fd-4eb0-bf22-39cc345b7fe2";
const ST_BASE = "https://data.solanatracker.io";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params;

  try {
    // Fetch PNL with historic data and holding verification
    const resp = await fetch(
      `${ST_BASE}/pnl/${wallet}?showHistoricPnL=true`,
      {
        headers: { "x-api-key": ST_API_KEY },
        cache: "no-store",
      }
    );
    if (!resp.ok) {
      return Response.json(
        { error: `ST API error: ${resp.status}` },
        { status: resp.status }
      );
    }
    const data = await resp.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: "ST API unavailable" }, { status: 502 });
  }
}
