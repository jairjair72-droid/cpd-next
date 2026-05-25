// SERVER-ONLY. Endpoints públicos de Binance Futures (sin auth).
import "server-only";
import type { FuturesData } from "@/lib/types";

const FUTURES_BASE = "https://fapi.binance.com";

interface PremiumIndex {
  symbol: string;
  markPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

interface OpenInterestStat {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
}

interface LongShortRatio {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

/**
 * Trae premiumIndex (funding rate) para TODOS los símbolos de una vez.
 * Es una sola llamada que devuelve ~300 contratos. Mucho más eficiente que
 * pedir uno por uno.
 */
async function fetchAllPremiumIndex(): Promise<Map<string, PremiumIndex>> {
  const res = await fetch(`${FUTURES_BASE}/fapi/v1/premiumIndex`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Binance Futures premiumIndex HTTP ${res.status}`);
  const data = (await res.json()) as PremiumIndex[];
  const map = new Map<string, PremiumIndex>();
  for (const p of data) map.set(p.symbol, p);
  return map;
}

/**
 * Open Interest histórico (24h atrás vs ahora) para calcular el cambio.
 * Este endpoint sí requiere un símbolo por llamada; lo paralelizamos en chunks.
 */
async function fetchOIStats(symbol: string): Promise<{ now: number; ago24h: number } | null> {
  try {
    const url = `${FUTURES_BASE}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenInterestStat[];
    if (!data.length) return null;
    const now = parseFloat(data[data.length - 1].sumOpenInterestValue);
    const ago24h = data.length >= 24
      ? parseFloat(data[0].sumOpenInterestValue)
      : parseFloat(data[0].sumOpenInterestValue);
    return { now, ago24h };
  } catch {
    return null;
  }
}

/**
 * Long/Short Ratio por símbolo. También uno por llamada — opcional, lo dejamos
 * con timeout corto para no frenar el escaneo si la API está lenta.
 */
async function fetchLongShortRatio(symbol: string): Promise<number | null> {
  try {
    const url = `${FUTURES_BASE}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`;
    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LongShortRatio[];
    if (!data.length) return null;
    return parseFloat(data[0].longShortRatio);
  } catch {
    return null;
  }
}

/**
 * Trae todos los datos de futuros para un set de símbolos.
 *
 * Estrategia:
 * 1. Una sola llamada al premiumIndex global (trae funding de todos los símbolos)
 * 2. Para cada símbolo del input, vemos si existe en el premiumIndex
 *    - Si no: marcamos `available: false` y se va sin OI/LSR
 *    - Si sí: lanzamos en paralelo el fetch de OI histórico
 * 3. Long/Short Ratio lo traemos solo si no rompe el budget de tiempo
 *
 * Chunks de 20 paralelos para no abusar del rate limit.
 */
export async function fetchFuturesBatch(symbols: string[]): Promise<Record<string, FuturesData>> {
  const premiumMap = await fetchAllPremiumIndex();
  const result: Record<string, FuturesData> = {};

  // Inicializamos todo como "no disponible" — los que tengan contrato se sobreescriben
  for (const sym of symbols) {
    result[sym] = {
      symbol: sym,
      funding_rate: 0,
      open_interest_usd: 0,
      open_interest_change_24h: null,
      long_short_ratio: null,
      available: false,
    };
  }

  // Filtramos los que SÍ tienen contrato
  const withFutures = symbols.filter((s) => premiumMap.has(s));

  // Procesamos en chunks de 20 paralelos
  const CHUNK = 20;
  for (let i = 0; i < withFutures.length; i += CHUNK) {
    const chunk = withFutures.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (sym) => {
        const premium = premiumMap.get(sym)!;
        const [oiStats, lsr] = await Promise.all([
          fetchOIStats(sym),
          fetchLongShortRatio(sym),
        ]);

        const oi_change_24h = oiStats && oiStats.ago24h > 0
          ? ((oiStats.now - oiStats.ago24h) / oiStats.ago24h) * 100
          : null;

        result[sym] = {
          symbol: sym,
          funding_rate: parseFloat(premium.lastFundingRate),
          open_interest_usd: oiStats?.now ?? 0,
          open_interest_change_24h: oi_change_24h,
          long_short_ratio: lsr,
          available: true,
        };
      }),
    );
  }

  return result;
}