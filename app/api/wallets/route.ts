export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WALLETS = (
  process.env.WALLETS || "7BNaxx6KdUYrjACNQZ9He26NBFoFxujQMAfNLnArLGH5"
)
  .split(",")
  .map((w) => w.trim());

export async function GET() {
  return Response.json({ wallets: WALLETS });
}
