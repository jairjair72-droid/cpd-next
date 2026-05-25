// SERVER-ONLY. CoinGecko queda como fallback cuando CMC falla o no tiene
// la moneda. La API pública de Demo no requiere key.
import "server-only";
import type { MarketMeta } from "@/lib/types";

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  market_cap_rank: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_change_percentage: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
}

export async function fetchCoinGeckoMarkets(pages = 4): Promise<Record<string, MarketMeta>> {
  const all: CoinGeckoCoin[] = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=24h,7d,30d`;
      const res = await fetch(url, { next: { revalidate: 120 } });
      if (!res.ok) break;
      const data = (await res.json()) as CoinGeckoCoin[];
      if (!data.length) break;
      all.push(...data);
      // CoinGecko Demo rate-limita feo, pausa entre páginas.
      if (page < pages) await new Promise((r) => setTimeout(r, 1500));
    } catch {
      break;
    }
  }

  const map: Record<string, MarketMeta> = {};
  for (const c of all) {
    const sym = c.symbol.toUpperCase();
    if (map[sym]) continue;
    map[sym] = {
      symbol: sym,
      name: c.name,
      slug: c.id, // CoinGecko id sirve como slug propio
      image: c.image,
      market_cap: c.market_cap,
      fully_diluted_valuation: c.fully_diluted_valuation,
      market_cap_rank: c.market_cap_rank,
      circulating_supply: c.circulating_supply,
      total_supply: c.total_supply,
      max_supply: c.max_supply,
      ath: c.ath,
      ath_date: c.ath_date,
      atl: c.atl,
      atl_date: c.atl_date,
      ath_change_percentage: c.ath_change_percentage,
      source: "coingecko",
    };
  }
  return map;
}
