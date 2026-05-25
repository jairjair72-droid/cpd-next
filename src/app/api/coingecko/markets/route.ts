import { NextResponse } from "next/server";
import { fetchCoinGeckoMarkets } from "@/lib/server/coingecko";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const pages = Math.min(Math.max(Number(searchParams.get("pages") ?? 4), 1), 10);
    const markets = await fetchCoinGeckoMarkets(pages);
    return NextResponse.json({ ok: true, source: "coingecko", markets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
