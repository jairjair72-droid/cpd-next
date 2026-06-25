// Este módulo se usa SOLO desde el browser (componentes 'use client').
// Llama a nuestras propias rutas /api/*, así no hay CORS ni keys expuestas.

import type {
  BinanceTicker,
  MarketMeta,
  EnrichedToken,
  AnalysisResult,
  FuturesData,
  FearGreedIndex
} from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    // intentamos extraer el error del body antes de tirar
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error ?? "";
    } catch { /* silent */ }
    throw new Error(`${res.status} ${detail || res.statusText}`);
  }
  return (await res.json()) as T;
}

// ─── Retry con backoff exponencial ──────────────────────────────────────────

export interface RetryOptions {
  /** Cuántos intentos totales (incluido el primero). Default: 3. */
  attempts?: number;
  /** Esperas entre intentos en ms. Si pasás menos que `attempts-1`, repite el último valor. */
  delays?: number[];
  /** Si devuelve true, NO reintentamos (error permanente, ej. 400). */
  shouldGiveUp?: (err: unknown) => boolean;
  /** Callback informativo entre reintentos (para logging). */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

/**
 * Wrapper genérico para retry con backoff exponencial.
 *
 * Por defecto: 3 intentos con esperas de 1s, 3s, 8s entre ellos. Reintenta
 * cualquier error a menos que `shouldGiveUp` lo descarte explícitamente.
 *
 * Si los `attempts` se agotan, re-lanza el último error.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delays = options.delays ?? [1000, 3000, 8000];
  const shouldGiveUp = options.shouldGiveUp ?? (() => false);

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Error permanente: no tiene sentido reintentar
      if (shouldGiveUp(err)) throw err;
      // Último intento: no esperamos, lanzamos
      if (i === attempts - 1) throw err;
      // Esperamos y notificamos
      const delay = delays[Math.min(i, delays.length - 1)];
      options.onRetry?.(i + 1, err, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Detecta si un error vale la pena reintentar. Los que NO reintentamos:
 *  - 400 Bad Request (nuestra payload está mal, no se va a arreglar solo)
 *  - 401/403 (problema de auth permanente)
 *  - 413 Request too large
 *
 * Los que SÍ reintentamos:
 *  - 429 (rate limit transitorio)
 *  - 5xx (Anthropic caído, sobrecarga, timeout)
 *  - Errores de red (fetch failed, ECONNRESET, etc.)
 */
export function isPermanentError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // Nuestros endpoints devuelven errores como "400 Bad Request" o similar
  if (/^4(00|01|03|13)\b/.test(msg)) return true;
  // "API key inválida" del server-side claude.ts
  if (/API key inválida/i.test(msg)) return true;
  // Mensaje específico de payload demasiado grande
  if (/request_too_large/i.test(msg)) return true;
  return false;
}

// ─── Binance ─────────────────────────────────────────────────────────────────

export async function getBinanceTickers(): Promise<BinanceTicker[]> {
  const r = await jsonFetch<{ ok: true; tickers: BinanceTicker[] }>(
    "/api/binance/tickers",
  );
  return r.tickers;
}

export interface KlineData {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

export async function getKlines(
  symbols: string[],
  interval: "1d" | "4h" | "1h" = "1d",
  limit = 30,
): Promise<Record<string, KlineData | null>> {
  const r = await jsonFetch<{ ok: true; klines: Record<string, KlineData | null> }>(
    "/api/binance/klines",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, interval, limit }),
    },
  );
  return r.klines;
}

// ─── Mercado (CMC con fallback a CoinGecko) ─────────────────────────────────

export async function getMarketMap(): Promise<{
  markets: Record<string, MarketMeta>;
  source: "cmc" | "coingecko";
}> {
  // Intento 1: CMC
  try {
    const r = await jsonFetch<{ ok: true; source: "cmc"; markets: Record<string, MarketMeta> }>(
      "/api/cmc/markets?limit=1000",
    );
    if (Object.keys(r.markets).length > 0) return { markets: r.markets, source: r.source };
  } catch (err) {
    console.warn("CMC falló, cayendo a CoinGecko:", err);
  }
  // Fallback: CoinGecko
  const r = await jsonFetch<{ ok: true; source: "coingecko"; markets: Record<string, MarketMeta> }>(
    "/api/coingecko/markets?pages=4",
  );
  return { markets: r.markets, source: r.source };
}

export async function getGlobalMetrics() {
  return jsonFetch<{
    ok: true;
    global: {
      btc_dominance: number;
      eth_dominance: number;
      total_market_cap: number;
      total_volume_24h: number;
      active_cryptocurrencies: number;
    };
  }>("/api/cmc/global");
}

// ─── Análisis Anthropic ──────────────────────────────────────────────────────

const USER_KEY_HEADER = "x-user-anthropic-key";

/**
 * Si el usuario configuró una key BYO desde Ajustes, la guardamos en
 * sessionStorage y la mandamos en el header. Si no, el server usa env var.
 * sessionStorage (no localStorage): la key no sobrevive al cierre del browser.
 */
function getUserKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem("cpd_user_anthropic_key");
  } catch {
    return null;
  }
}

function buildAnalyzeHeaders(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const k = getUserKey();
  if (k) h[USER_KEY_HEADER] = k;
  return h;
}

export async function analyze(
  token: Partial<EnrichedToken> | Record<string, unknown>,
): Promise<AnalysisResult | null> {
  const r = await jsonFetch<{ ok: true; analysis: AnalysisResult }>(
    "/api/analyze",
    {
      method: "POST",
      headers: buildAnalyzeHeaders(),
      body: JSON.stringify({ token }),
    },
  );
  return r.analysis;
}

/**
 * Versión streaming: invoca a /api/analyze?stream=1 (SSE) y va llamando a
 * `onDelta` con cada fragmento del JSON que va escupiendo el modelo. Al
 * terminar, devuelve el `AnalysisResult` parseado del JSON completo.
 *
 * El backend hace el parse y nos manda el objeto final, así que el cliente no
 * necesita reparsear nada.
 */
export async function analyzeStream(
  token: Partial<EnrichedToken> | Record<string, unknown>,
  onDelta: (chunk: string) => void,
): Promise<AnalysisResult | null> {
  const res = await fetch("/api/analyze?stream=1", {
    method: "POST",
    headers: buildAnalyzeHeaders(),
    body: JSON.stringify({ token }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let analysis: AnalysisResult | null = null;
  let aborted = false;

  while (!aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE: eventos separados por "\n\n"
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.replace(/^data: /, "").trim();
      if (!line) continue;
      try {
        const evt = JSON.parse(line) as
          | { delta: string }
          | { done: true; analysis: AnalysisResult | null }
          | { error: string };
        if ("error" in evt) {
          throw new Error(evt.error);
        }
        if ("delta" in evt) {
          onDelta(evt.delta);
        }
        if ("done" in evt && evt.done) {
          analysis = evt.analysis;
          aborted = true;
        }
      } catch (err) {
        if (err instanceof Error && err.message) throw err;
      }
    }
  }
  return analysis;
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const r = await jsonFetch<{ ok: boolean }>(
      "/api/telegram",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, chatId, text }),
      },
    );
    return r.ok;
  } catch {
    return false;
  }
}

// ─── Enriquecimiento (igual lógica que original, pero ahora client-side
// porque solo combina datos ya descargados) ─────────────────────────────────

export function enrichToken(
  ticker: BinanceTicker,
  id: number,
  marketMap: Record<string, MarketMeta>,
  klineMap: Record<string, KlineData | null>,
): EnrichedToken {
  const price_history = klineMap[ticker.binanceSymbol]?.closes ?? Array(30).fill(ticker.price);

  const len = price_history.length;
  const change_7d = len >= 7
    ? +((ticker.price / price_history[len - 7] - 1) * 100).toFixed(1)
    : 0;
  const change_30d = len >= 30
    ? +((ticker.price / price_history[0] - 1) * 100).toFixed(1)
    : 0;

  const meta = marketMap[ticker.symbol] ?? null;

  let ath_distance_pct: number;
  let ath_price: number | null = null;
  let ath_date: string | null = null;
  if (meta?.ath) {
    ath_price = meta.ath;
    ath_date = meta.ath_date;
    ath_distance_pct = Math.abs(meta.ath_change_percentage ?? 0);
  } else if (meta?.ath_change_percentage != null) {
    // CMC no nos da ath pero podríamos pedirlo a /info; por ahora calculamos
    // contra el máximo de 30d.
    const high30d = Math.max(...price_history);
    ath_distance_pct = high30d > 0 ? +((1 - ticker.price / high30d) * 100).toFixed(1) : 0;
  } else {
    const high30d = Math.max(...price_history);
    ath_distance_pct = high30d > 0 ? +((1 - ticker.price / high30d) * 100).toFixed(1) : 0;
  }

  const mcap_usd = meta?.market_cap ?? ticker.price * 100_000_000;
  const vol_mcap_ratio = mcap_usd > 0 ? +(ticker.vol24h_usd / mcap_usd).toFixed(3) : 0;

  const exchange_netflow =
    ticker.change_24h < -1 && ticker.vol24h_usd > 2_000_000
      ? -Math.round(ticker.vol24h_usd * 0.1)
      : Math.round(ticker.vol24h_usd * 0.05);

  const social_score = Math.min(100, Math.floor(ticker.tradeCount / 5_000));

  return {
    id,
    symbol: ticker.symbol,
    binanceSymbol: ticker.binanceSymbol,
    name: meta?.name ?? ticker.symbol,
    image: meta?.image ?? null,
    slug: meta?.slug ?? null,
    price: ticker.price,
    change_24h: ticker.change_24h,
    high24h: ticker.high24h,
    low24h: ticker.low24h,
    tradeCount: ticker.tradeCount,
    mcap_usd,
    fdv_usd: meta?.fully_diluted_valuation ?? null,
    rank: meta?.market_cap_rank ?? null,
    circulating_supply: meta?.circulating_supply ?? null,
    total_supply: meta?.total_supply ?? null,
    max_supply: meta?.max_supply ?? null,
    ath_price,
    ath_date,
    atl_price: meta?.atl ?? null,
    atl_date: meta?.atl_date ?? null,
    vol24h: ticker.vol24h_usd,
    vol_mcap_ratio,
    age_days: 365,
    change_7d,
    change_30d,
    whale_concentration: 30,
    wallet_growth_30d: 10,
    exchange_netflow,
    social_score,
    multi_exchange: ticker.vol24h_usd > 5_000_000,
    ath_distance_pct: +ath_distance_pct.toFixed(1),
    price_history,
    exchange: "Binance Spot",
    has_full_data: !!meta,
    meta_source: meta?.source ?? "none",
    discovered_at: Date.now(),
    last_updated_at: Date.now(),
  };
}

// ─── Radar: Futures + Sentiment ──────────────────────────────────────────────

export async function getFuturesData(symbols: string[]): Promise<Record<string, FuturesData>> {
  const r = await jsonFetch<{ ok: true; futures: Record<string, FuturesData> }>(
    "/api/binance/futures",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    },
  );
  return r.futures;
}

export async function getFearGreed(): Promise<FearGreedIndex> {
  const r = await jsonFetch<{ ok: true; fng: FearGreedIndex }>("/api/sentiment/fng");
  return r.fng;
}

// ─── Watchlist: catálogo de pares disponibles ───────────────────────────────

export interface SymbolEntry {
  symbol: string;
  binanceSymbol: string;
}

/** Lista de todos los pares USDT activos para autocomplete. */
export async function getAvailableSymbols(): Promise<SymbolEntry[]> {
  const r = await jsonFetch<{ ok: true; symbols: SymbolEntry[] }>(
    "/api/binance/symbols",
  );
  return r.symbols;
}

// ─── Deep-link a CoinMarketCap usando el slug real cuando lo tenemos ────────

export function cmcUrl(tok: { slug?: string | null; name?: string; symbol: string; has_full_data?: boolean }): string {
  // Si tenemos el slug REAL desde CMC, usamos esa URL exacta (no más adivinar).
  if (tok.slug && tok.has_full_data) {
    return `https://coinmarketcap.com/currencies/${tok.slug}/`;
  }
  // Si tenemos nombre pero no slug, hacemos slug-guess como fallback.
  if (tok.has_full_data && tok.name) {
    const slug = tok.name
      .toLowerCase()
      .replace(/[()'.]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `https://coinmarketcap.com/currencies/${slug}/`;
  }
  return `https://coinmarketcap.com/?searchTerm=${tok.symbol}`;
}

// ─── Narrativa IA ────────────────────────────────────────────────────────────

/**
 * Narrativa individual de un token. Recibe los indicadores y devuelve 2-3
 * oraciones. Usa el mismo header de BYO key que analyze().
 */
export async function narrateToken(
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    const r = await jsonFetch<{ ok: true; text: string }>("/api/narrate", {
      method: "POST",
      headers: buildAnalyzeHeaders(), // reusa la lógica de BYO key
      body: JSON.stringify({ mode: "individual", payload }),
    });
    return r.text;
  } catch {
    return null; // narrativa es opcional — nunca rompe el flujo
  }
}

/** Resumen global del escaneo. */
export async function narrateGlobal(
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    const r = await jsonFetch<{ ok: true; text: string }>("/api/narrate", {
      method: "POST",
      headers: buildAnalyzeHeaders(),
      body: JSON.stringify({ mode: "global", payload }),
    });
    return r.text;
  } catch {
    return null;
  }
}
