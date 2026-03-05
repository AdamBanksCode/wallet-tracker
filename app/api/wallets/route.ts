export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECODER_URL = process.env.DECODER_URL || "http://localhost:9109";

export async function GET() {
  const res = await fetch(`${DECODER_URL}/v1/wallets`);
  const data = await res.json();
  return Response.json(data);
}
