import { NextResponse } from "next/server";
import { fetchBinanceTickers } from "@/lib/server/binance";

export const runtime = "nodejs";

export async function GET() {
  try {
    const tickers = await fetchBinanceTickers();
    return NextResponse.json({ ok: true, tickers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
