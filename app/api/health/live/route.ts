export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(
    { ok: true, data: { status: "alive" } },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
