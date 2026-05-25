// SERVER-ONLY. La clave de CMC vive en process.env.CMC_API_KEY.
import "server-only";
import type { MarketMeta } from "@/lib/types";

const CMC_BASE = "https://pro-api.coinmarketcap.com";

function getKey(): string {
  const k = process.env.CMC_API_KEY;
  if (!k) throw new Error("CMC_API_KEY no está configurada en .env.local");
  return k;
}

interface CmcQuote {
  price: number;
  volume_24h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  market_cap: number;
  fully_diluted_market_cap: number | null;
  last_updated: string;
}

interface CmcListing {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmc_rank: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  date_added: string;
  quote: { USD: CmcQuote };
}

interface CmcListingsResponse {
  status: { error_code: number; error_message: string | null };
  data: CmcListing[];
}

interface CmcInfo {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  logo: string;
  urls?: Record<string, string[]>;
}

interface CmcInfoResponse {
  status: { error_code: number; error_message: string | null };
  data: Record<string, CmcInfo>; // keyed por id de CMC
}

interface CmcGlobalResponse {
  status: { error_code: number; error_message: string | null };
  data: {
    btc_dominance: number;
    eth_dominance: number;
    active_cryptocurrencies: number;
    quote: {
      USD: {
        total_market_cap: number;
        total_volume_24h: number;
        last_updated: string;
      };
    };
  };
}

/**
 * Trae los top `limit` por market cap desde CMC y los devuelve como un mapa
 * SYMBOL → MarketMeta. Hace una sola llamada (recibe hasta 5000 en una sola
 * pegada), así que es mucho más barato que el endpoint /info por símbolos.
 *
 * Tarifa: 1 crédito por cada 200 cryptos. limit=1000 → 5 créditos.
 */
export async function fetchCmcListings(limit = 1000): Promise<Record<string, MarketMeta>> {
  const url = new URL(`${CMC_BASE}/v1/cryptocurrency/listings/latest`);
  url.searchParams.set("start", "1");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("convert", "USD");
  url.searchParams.set("sort", "market_cap");
  url.searchParams.set("sort_dir", "desc");

  const res = await fetch(url.toString(), {
    headers: {
      "X-CMC_PRO_API_KEY": getKey(),
      Accept: "application/json",
    },
    next: { revalidate: 120 }, // 2 min de cache → no quemar créditos
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CMC listings HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as CmcListingsResponse;
  if (json.status.error_code !== 0) {
    throw new Error(`CMC error ${json.status.error_code}: ${json.status.error_message ?? ""}`);
  }

  const map: Record<string, MarketMeta> = {};
  for (const c of json.data) {
    const sym = c.symbol.toUpperCase();
    // CMC permite múltiples coins por símbolo (ej. distintos UNI). Nos quedamos
    // con el primero (mayor mcap por orden de la query).
    if (map[sym]) continue;

    const q = c.quote?.USD;
    map[sym] = {
      symbol: sym,
      name: c.name,
      slug: c.slug,
      image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${c.id}.png`,
      market_cap: q?.market_cap ?? null,
      fully_diluted_valuation: q?.fully_diluted_market_cap ?? null,
      market_cap_rank: c.cmc_rank,
      circulating_supply: c.circulating_supply,
      total_supply: c.total_supply,
      max_supply: c.max_supply,
      ath: null, // CMC no entrega ATH en /listings; quedaría en /v2/cryptocurrency/info
      ath_date: null,
      atl: null,
      atl_date: null,
      ath_change_percentage: null,
      source: "cmc",
    };
  }
  return map;
}

/** Métricas globales del mercado (BTC dominance, total mcap, etc.). */
export async function fetchCmcGlobalMetrics() {
  const res = await fetch(`${CMC_BASE}/v1/global-metrics/quotes/latest`, {
    headers: {
      "X-CMC_PRO_API_KEY": getKey(),
      Accept: "application/json",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`CMC global HTTP ${res.status}`);
  }
  const json = (await res.json()) as CmcGlobalResponse;
  if (json.status.error_code !== 0) {
    throw new Error(`CMC error ${json.status.error_code}`);
  }
  return {
    btc_dominance: json.data.btc_dominance,
    eth_dominance: json.data.eth_dominance,
    active_cryptocurrencies: json.data.active_cryptocurrencies,
    total_market_cap: json.data.quote.USD.total_market_cap,
    total_volume_24h: json.data.quote.USD.total_volume_24h,
  };
}

/** Metadata extra (logo grande, links, descripción) para uno o más símbolos. */
export async function fetchCmcInfo(symbols: string[]) {
  if (!symbols.length) return {};
  const url = new URL(`${CMC_BASE}/v2/cryptocurrency/info`);
  url.searchParams.set("symbol", symbols.join(","));
  url.searchParams.set("aux", "urls,logo");

  const res = await fetch(url.toString(), {
    headers: {
      "X-CMC_PRO_API_KEY": getKey(),
      Accept: "application/json",
    },
    next: { revalidate: 3600 }, // 1h — son datos muy estables
  });
  if (!res.ok) throw new Error(`CMC info HTTP ${res.status}`);
  const json = (await res.json()) as CmcInfoResponse;
  if (json.status.error_code !== 0) {
    throw new Error(`CMC error ${json.status.error_code}`);
  }
  return json.data;
}
