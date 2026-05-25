import { NextResponse } from "next/server";
import { STABLECOINS } from "@/lib/constants";

export const runtime = "nodejs";

interface BinanceSymbolInfo {
  symbol: string;
  status: "TRADING" | "BREAK" | "HALT" | string;
  quoteAsset: string;
  baseAsset: string;
  isSpotTradingAllowed: boolean;
}

interface ExchangeInfoResponse {
  symbols: BinanceSymbolInfo[];
}

/**
 * Devuelve la lista de pares USDT activos en Binance Spot.
 * Cachea 1h porque cambia raramente (nuevos listings).
 *
 * Output: [{ symbol: "BTC", binanceSymbol: "BTCUSDT", name?: string }]
 */
export async function GET() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/exchangeInfo", {
      cache: "no-store", // response > 2MB, mismo issue que tickers
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Binance exchangeInfo HTTP ${res.status}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as ExchangeInfoResponse;

    const usdtPairs = data.symbols
      .filter(
        (s) =>
          s.quoteAsset === "USDT" &&
          s.status === "TRADING" &&
          s.isSpotTradingAllowed &&
          !STABLECOINS.has(s.baseAsset),
      )
      .map((s) => ({
        symbol: s.baseAsset,
        binanceSymbol: s.symbol,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    return NextResponse.json({ ok: true, symbols: usdtPairs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}