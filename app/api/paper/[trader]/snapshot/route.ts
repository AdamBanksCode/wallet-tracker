export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECODER_URL =
  process.env.DECODER_URL || "http://20.52.113.255:9109";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ trader: string }> }
) {
  const { trader } = await params;
  try {
    const resp = await fetch(
      `${DECODER_URL}/api/paper/${trader}/snapshot`,
      { cache: "no-store" }
    );
    if (!resp.ok) return new Response("upstream error", { status: 502 });
    const data = await resp.json();
    return Response.json(data);
  } catch {
    return new Response("paper trader unavailable", { status: 502 });
  }
}
