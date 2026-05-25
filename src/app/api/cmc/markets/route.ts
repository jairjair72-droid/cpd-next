import { NextResponse } from "next/server";
import { fetchCmcListings } from "@/lib/server/cmc";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 1000), 1), 5000);
    const markets = await fetchCmcListings(limit);
    return NextResponse.json({ ok: true, source: "cmc", markets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
