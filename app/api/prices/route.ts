export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOL_MINT = "So11111111111111111111111111111111111111112";

// Fetch current USD prices from Raydium, then convert to SOL-denominated
// Query: ?ids=mint1,mint2,...  (max 100)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  if (!ids) {
    return Response.json({ error: "ids required" }, { status: 400 });
  }

  const mints = ids.split(",").slice(0, 100);
  // Include SOL mint so we can convert USD prices to SOL-denominated
  const allMints = [...new Set([...mints, SOL_MINT])];

  try {
    const resp = await fetch(
      `https://api-v3.raydium.io/mint/price?mints=${allMints.join(",")}`,
      { cache: "no-store" }
    );
    if (!resp.ok) {
      return Response.json({ error: "raydium api error" }, { status: 502 });
    }
    const json = await resp.json();
    const usdPrices: Record<string, number> = json.data || {};
    const solUsd = parseFloat(String(usdPrices[SOL_MINT] || "0"));

    if (solUsd <= 0) {
      return Response.json({ error: "no sol price" }, { status: 502 });
    }

    // Convert to price-per-token in SOL
    const prices: Record<string, number> = {};
    for (const mint of mints) {
      const usd = parseFloat(String(usdPrices[mint] || "0"));
      if (usd > 0) {
        prices[mint] = usd / solUsd;
      }
    }
    return Response.json({ prices, solUsd });
  } catch {
    return Response.json({ error: "fetch failed" }, { status: 502 });
  }
}
