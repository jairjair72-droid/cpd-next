// SERVER-ONLY. Solo se importa desde rutas /app/api/binance/*.
import "server-only";
import { STABLECOINS } from "@/lib/constants";
import type { BinanceTicker } from "@/lib/types";

interface BinanceRawTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
  count: number | string;
}

const MIN_VOLUME_USD = 500_000;

export async function fetchBinanceTickers(): Promise<BinanceTicker[]> {
  const res = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", {
    // En el servidor podemos cachear durante 30s para no bombardear.
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Binance ticker24hr HTTP ${res.status}`);
  const data = (await res.json()) as BinanceRawTicker[];

  return data
    .filter((t) => {
      const sym = t.symbol.replace("USDT", "");
      return (
        t.symbol.endsWith("USDT") &&
        !STABLECOINS.has(sym) &&
        parseFloat(t.quoteVolume) > MIN_VOLUME_USD &&
        parseFloat(t.lastPrice) > 0
      );
    })
    .map<BinanceTicker>((t) => ({
      symbol: t.symbol.replace("USDT", ""),
      binanceSymbol: t.symbol,
      price: parseFloat(t.lastPrice),
      change_24h: parseFloat(t.priceChangePercent),
      vol24h_usd: parseFloat(t.quoteVolume),
      high24h: parseFloat(t.highPrice),
      low24h: parseFloat(t.lowPrice),
      tradeCount: typeof t.count === "string" ? parseInt(t.count, 10) || 0 : t.count || 0,
    }))
    .sort((a, b) => b.vol24h_usd - a.vol24h_usd);
}

/** Devuelve closes y volúmenes (USD) de las últimas `limit` velas. */
export async function fetchKlines(
  binanceSymbol: string,
  interval: "1d" | "4h" | "1h" = "1d",
  limit = 30,
): Promise<{ opens: number[]; highs: number[]; lows: number[]; closes: number[]; volumes: number[] } | null> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown[][];
    return {
      opens:   data.map((k) => parseFloat(k[1] as string)),
      highs:   data.map((k) => parseFloat(k[2] as string)),
      lows:    data.map((k) => parseFloat(k[3] as string)),
      closes:  data.map((k) => parseFloat(k[4] as string)),
      volumes: data.map((k) => parseFloat(k[7] as string)),
    };
  } catch {
    return null;
  }
}
