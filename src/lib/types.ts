// ─── Dominio: tokens ─────────────────────────────────────────────────────────

export type Signal = "ACUMULAR" | "OBSERVAR" | "EVITAR";
export type Risk = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
export type Horizon = "short" | "mid" | "long";
export type AnalysisType = "accumulation" | "breakout" | "recovery" | "unknown";

/** Ticker crudo que devuelve Binance una vez normalizado por el servidor. */
export interface BinanceTicker {
  symbol: string;
  binanceSymbol: string;
  price: number;
  change_24h: number;
  vol24h_usd: number;
  high24h: number;
  low24h: number;
  tradeCount: number;
}

/** Snapshot de mercado proveniente de CMC o CoinGecko, normalizado. */
export interface MarketMeta {
  symbol: string;
  name: string;
  slug: string | null;
  image: string | null;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  market_cap_rank: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_date: string | null;
  atl: number | null;
  atl_date: string | null;
  ath_change_percentage: number | null;
  source: "cmc" | "coingecko";
}

/** Token enriquecido listo para mostrar y analizar. */
export interface EnrichedToken {
  id: number;
  symbol: string;
  binanceSymbol: string;
  name: string;
  image: string | null;
  slug: string | null;
  price: number;
  change_24h: number;
  high24h: number;
  low24h: number;
  tradeCount: number;
  mcap_usd: number;
  fdv_usd: number | null;
  rank: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath_price: number | null;
  ath_date: string | null;
  atl_price: number | null;
  atl_date: string | null;
  vol24h: number;
  vol_mcap_ratio: number;
  age_days: number;
  change_7d: number;
  change_30d: number;
  whale_concentration: number;
  wallet_growth_30d: number;
  exchange_netflow: number;
  social_score: number;
  multi_exchange: boolean;
  ath_distance_pct: number;
  price_history: number[];
  exchange: string;
  has_full_data: boolean;
  meta_source: "cmc" | "coingecko" | "none";
  discovered_at: number;
  last_updated_at: number;
}

/** Resultado del análisis de Claude. */
export interface AnalysisResult {
  score: number;
  type: AnalysisType;
  signal: Signal;
  reason: string;
  risk: Risk;
  hodl_horizon: Horizon;
}

/** Token + análisis IA: lo que vive en `candidates`. */
export interface CandidateToken extends EnrichedToken, AnalysisResult {
  previous_signal?: Signal;
  previous_score?: number;
  previous_price?: number;
}

// ─── Logs y otros ────────────────────────────────────────────────────────────

export type LogType = "info" | "hit" | "warn" | "scan" | "skip" | "done";
export interface ScanLogEntry {
  msg: string;
  type: LogType;
  t: string;
}

export interface Alert {
  id: number;
  symbol: string;
  score: number;
  signal: Signal;
  reason: string;
  type: AnalysisType;
  risk: Risk;
  time: string;
  exchange: string;
}

export interface ApiHealth {
  ok: boolean | null;
  ts: number | null;
}

export interface ApiStatus {
  binance: ApiHealth;
  marketdata: ApiHealth; // CMC o CoinGecko, lo que use el server
  anthropic: ApiHealth;
}

export interface TelegramSent {
  ts: number;
  time: string;
  symbol: string;
  signal: Signal;
  ok: boolean;
}

export interface ScanHistoryEntry {
  date: string;
  total: number;
  candidates: number;
  top: number;
}

// ─── Radar — Futures + Sentiment + Indicadores ───────────────────────────────

export interface FuturesData {
  symbol: string;             // ej. "BTCUSDT"
  funding_rate: number;        // ej. -0.00042 → -0.042%
  open_interest_usd: number;   // OI nominal en USD
  open_interest_change_24h: number | null; // % cambio vs 24h atrás, si está disponible
  long_short_ratio: number | null;          // ratio de cuentas long/short (>1 = más longs)
  available: boolean;          // false si el token no tiene contrato de futuros
}

export interface FearGreedIndex {
  value: number;               // 0-100
  classification:
    | "Extreme Fear"
    | "Fear"
    | "Neutral"
    | "Greed"
    | "Extreme Greed";
  timestamp: number;           // ms
}

// ─── Indicadores técnicos calculados por token ───────────────────────────────

export interface TechnicalIndicators {
  rvol: number;                // volume24h / sma(volume, 20). >1 = más activo que la media
  bb_squeeze: number;          // 0-1 → 1 = bandas comprimidas al máximo (movimiento inminente)
  rsi: number;                 // RSI 14 estándar (0-100)
  rsi_bullish_divergence: boolean; // precio baja pero RSI sube (señal alcista)
  ath_distance_pct: number;    // % bajo el ATH (positivo, mayor = más caído)
  range_position_90d: number;  // 0-1 → posición dentro del rango (low-high) de 90 días
  funding_rate: number | null;       // si tiene futures
  oi_change_24h: number | null;      // si tiene futures
  has_futures: boolean;
}

// ─── Score compuesto del Radar ───────────────────────────────────────────────

/** Subcomponentes del score predictivo, cada uno con su peso aplicado. */
export interface RadarScoreBreakdown {
  rvol: number;            // peso 25
  bb_squeeze: number;      // peso 15
  rsi: number;             // peso 20
  range_position: number;  // peso 15
  futures: number;         // peso 20 (0 si no hay futures, otros se redistribuyen)
  fng_modulator: number;   // peso 5
  total: number;           // 0-100, normalizado
}

export type ClaudeAgreement = "AGREE" | "DISAGREE_BULL" | "DISAGREE_BEAR" | "NEUTRAL";
// AGREE: ambos coinciden direccionalmente
// DISAGREE_BULL: Radar alto pero Claude EVITAR (oportunidad técnica que fundamental rechaza)
// DISAGREE_BEAR: Radar bajo pero Claude ACUMULAR (Claude ve algo que los técnicos no)
// NEUTRAL: zona media, sin desacuerdo claro

/** Una señal del Radar (snapshot en un momento del tiempo). */
export interface RadarSignal {
  id: string;                     // único: `${symbol}-${timestamp}`
  symbol: string;
  detected_at: number;            // timestamp ms
  detection_price: number;
  technical_score: number;        // 0-100
  breakdown: RadarScoreBreakdown;
  reasons: string[];              // chips legibles: "RVOL 3.2x", "Squeeze 0.85", etc.
  indicators: TechnicalIndicators;
  claude_signal: Signal | null;   // qué dijo Claude en el mismo escaneo (puede ser null si no se analizó)
  claude_score: number | null;
  agreement: ClaudeAgreement;
  /** Outcomes se llenan en escaneos posteriores, no en la detección. */
  outcomes?: SignalOutcome;
}

export interface SignalOutcome {
  /** Precio del token a los N días de detectar la señal. */
  price_7d?: number;
  price_14d?: number;
  price_30d?: number;
  /** % de cambio entre detection_price y el precio a los N días. */
  change_7d_pct?: number;
  change_14d_pct?: number;
  change_30d_pct?: number;
  /** Mejor % alcanzado en cualquier punto del período (peak). */
  peak_pct?: number;
  days_to_peak?: number;
  /** Estados de cierre: una vez que pasó el horizonte, queda fijo. */
  closed_7d: boolean;
  closed_14d: boolean;
  closed_30d: boolean;
  last_observed_at: number;
  last_observed_price: number;
}

/** Stats agregadas para mostrar performance histórica. */
export interface RadarPerformance {
  total_signals: number;
  signals_with_7d_outcome: number;
  signals_with_14d_outcome: number;
  signals_with_30d_outcome: number;
  hit_rate_7d: number | null;       // % de señales con change_7d_pct > 0 (entre las cerradas)
  hit_rate_14d: number | null;
  hit_rate_30d: number | null;
  avg_change_7d: number | null;
  avg_change_14d: number | null;
  avg_change_30d: number | null;
  median_change_7d: number | null;
  best_signal: RadarSignal | null;
  worst_signal: RadarSignal | null;
}

// ─── Watchlist ──────────────────────────────────────────────────────────────

/** Una entrada en la watchlist del usuario. */
export interface WatchlistEntry {
  symbol: string;            // ej. "BTC" (sin "USDT")
  binanceSymbol: string;     // ej. "BTCUSDT"
  added_at: number;          // ms
  added_price: number;       // precio al momento de agregar (para calcular % desde entonces)
  /** Umbral opcional: si el score técnico del Radar cruza este valor → alerta. */
  threshold_score?: number;
  /** Umbral opcional: si Claude cambia su señal a esta o algo mejor → alerta. */
  threshold_signal?: Signal;
  /** Notas personales del usuario sobre por qué eligió este token. */
  notes?: string;
}

/** Snapshot de un token de la watchlist en un momento del tiempo.
 * Se va llenando en cada `runDiscover`. */
export interface WatchlistSnapshot {
  symbol: string;
  ts: number;
  price: number;
  vol24h: number;
  change_24h: number;
  technical_score: number | null;   // score del Radar si se calculó
  claude_signal: Signal | null;
  claude_score: number | null;
  /** Resumen 1-línea generado por Claude (tu campo `reason`). */
  reason: string | null;
}

/** Alerta disparada cuando un token de la watchlist cruza un umbral. */
export interface WatchlistAlert {
  id: string;
  ts: number;
  symbol: string;
  type: "threshold_score" | "threshold_signal" | "price_spike" | "signal_change";
  message: string;
  /** Si el usuario ya la vio. Cuando entra al tab Watchlist, todas pasan a true. */
  read: boolean;
}

/** Stats agregadas del comportamiento de la watchlist completa. */
export interface WatchlistStats {
  total: number;
  winners_since_added: number;   // tokens con % positivo desde added_at
  losers_since_added: number;
  avg_pct_since_added: number;   // promedio % cambio desde added_at
  best_performer: { symbol: string; pct: number } | null;
  worst_performer: { symbol: string; pct: number } | null;
}

// ─── Narrativa IA ───────────────────────────────────────────────────────────

/** Narrativa individual de un token (top 5 del Radar). */
export interface NarrativeEntry {
  symbol: string;
  text: string;               // 2-3 oraciones en español, generadas por Claude
  generated_at: number;       // ms — para mostrar antigüedad y para el cache
  /** Hash de los indicadores con que se generó — para detectar si cambió lo suficiente. */
  indicators_fingerprint: string;
  technical_score: number;    // score que tenía cuando se narró
}

/** Resumen global de un escaneo completo. */
export interface GlobalNarrative {
  text: string;               // 2-3 oraciones panorámicas
  generated_at: number;
  scan_token_count: number;   // cuántos tokens se escanearon
  candidate_count: number;    // cuántos pasaron el filtro de Claude
}