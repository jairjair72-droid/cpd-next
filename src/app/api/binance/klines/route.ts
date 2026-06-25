import { NextResponse } from "next/server";
import { fetchKlines } from "@/lib/server/binance";

export const runtime = "nodejs";

interface Body {
  symbols: string[];
  interval?: "1d" | "4h" | "1h";
  limit?: number;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const symbols = Array.isArray(body.symbols) ? body.symbols.slice(0, 200) : [];
    if (!symbols.length) {
      return NextResponse.json({ ok: false, error: "symbols vacío" }, { status: 400 });
    }

    const interval = body.interval ?? "1d";
    const limit = body.limit ?? 30;

    const entries = await Promise.all(
      symbols.map(async (sym) => {
        const data = await fetchKlines(sym, interval, limit);
        return [sym, data] as const;
      }),
    );
    // Estructura nueva: cada símbolo mapea a { closes, volumes } | null
    const result: Record<string, { opens: number[]; highs: number[]; lows: number[]; closes: number[]; volumes: number[] } | null> =
      Object.fromEntries(entries);
    return NextResponse.json({ ok: true, klines: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}