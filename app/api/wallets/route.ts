export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WALLETS = (
  process.env.WALLETS || "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm,2T5NgDDidkvhJQg8AHDi74uCFwgp25pYFMRZXBaCUNBH"
)
  .split(",")
  .map((w) => w.trim());

export async function GET() {
  return Response.json({ wallets: WALLETS });
}
