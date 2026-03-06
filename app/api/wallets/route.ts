export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WALLETS = (
  process.env.WALLETS || "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm"
)
  .split(",")
  .map((w) => w.trim());

export async function GET() {
  return Response.json({ wallets: WALLETS });
}
