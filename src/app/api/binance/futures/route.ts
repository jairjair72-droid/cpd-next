import { NextResponse } from "next/server";
import { fetchFuturesBatch } from "@/lib/server/futures";

export const runtime = "nodejs";

interface Body {
  symbols: string[]; // ej. ["BTCUSDT", "ETHUSDT", ...]
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const symbols = Array.isArray(body.symbols) ? body.symbols.slice(0, 200) : [];
    if (!symbols.length) {
      return NextResponse.json({ ok: false, error: "symbols vacío" }, { status: 400 });
    }
    const futures = await fetchFuturesBatch(symbols);
    return NextResponse.json({ ok: true, futures });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}