// Indicadores técnicos puros. Funciones puras — input números, output números.
// No tocan red, no tocan UI. Testeables aisladamente.

import type { TechnicalIndicators } from "@/lib/types";

// ─── Helpers básicos ────────────────────────────────────────────────────────

function sma(arr: number[], period: number): number {
  if (!arr.length) return 0;
  const slice = arr.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function stdDev(arr: number[], period: number): number {
  if (!arr.length) return 0;
  const slice = arr.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  return Math.sqrt(variance);
}

// ─── RSI (Relative Strength Index, 14 períodos) ─────────────────────────────

/**
 * RSI clásico de Wilder con suavizado SMA (no EMA — más estable para señales
 * de divergencia). Devuelve 0-100. Por encima de 70 = sobrecomprado, bajo 30 =
 * sobrevendido, pero su valor real está en las divergencias.
 */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50; // neutro si no hay data suficiente
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? -c : 0));
  const avgGain = sma(gains, period);
  const avgLoss = sma(losses, period);
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Detecta divergencia alcista clásica: precio hace mínimos más bajos pero
 * RSI hace mínimos más altos en el mismo período. Señal de momentum vendedor
 * agotándose.
 *
 * Comparamos dos ventanas: la primera mitad y la segunda mitad de los últimos
 * `window` períodos. Si en la segunda mitad el precio está más bajo pero el
 * RSI está más alto → divergencia.
 */
export function detectBullishDivergence(closes: number[], window = 20): boolean {
  if (closes.length < window + 14) return false;
  const recent = closes.slice(-window);
  const half = Math.floor(window / 2);
  const firstHalf = recent.slice(0, half);
  const secondHalf = recent.slice(half);

  const priceMin1 = Math.min(...firstHalf);
  const priceMin2 = Math.min(...secondHalf);

  // RSI en cada subventana — usamos un cálculo simple sobre la sub-serie
  const rsi1 = rsi(closes.slice(0, closes.length - half));
  const rsi2 = rsi(closes);

  return priceMin2 < priceMin1 && rsi2 > rsi1;
}

// ─── Bollinger Bands Squeeze ────────────────────────────────────────────────

/**
 * Mide qué tan "comprimidas" están las Bollinger Bands. Devuelve 0-1:
 *  - 1 = compresión máxima (volatilidad implícita en mínimos del período)
 *  - 0 = bandas amplias (alta volatilidad reciente)
 *
 * El cálculo: comparamos el ancho actual de las bandas con el ancho mínimo
 * de los últimos `lookback` períodos. Si estamos cerca del mínimo, squeeze
 * alto.
 */
export function bollingerSqueeze(
  closes: number[],
  period = 20,
  stdMult = 2,
  lookback = 90,
): number {
  if (closes.length < Math.max(period, lookback)) return 0;

  const widths: number[] = [];
  for (let i = period; i <= closes.length; i++) {
    const slice = closes.slice(i - period, i);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    const upper = mean + stdMult * sd;
    const lower = mean - stdMult * sd;
    widths.push((upper - lower) / mean); // normalizado por precio
  }

  const recentWidths = widths.slice(-lookback);
  const currentWidth = widths[widths.length - 1];
  const minWidth = Math.min(...recentWidths);
  const maxWidth = Math.max(...recentWidths);

  if (maxWidth === minWidth) return 0;

  // Posición relativa invertida: si current = min → squeeze = 1
  return 1 - (currentWidth - minWidth) / (maxWidth - minWidth);
}

// ─── RVOL ───────────────────────────────────────────────────────────────────

/**
 * Volumen relativo. Volumen actual dividido por el promedio de los últimos
 * N períodos. >1 = más actividad que la media, >2 = inusualmente alto.
 *
 * Lo capeamos a 10 para evitar valores extremos cuando el promedio histórico
 * fue casi cero.
 */
export function rvol(currentVol: number, historicalVols: number[], period = 20): number {
  if (!historicalVols.length) return 1;
  const avg = sma(historicalVols, period);
  if (avg === 0) return 1;
  return Math.min(currentVol / avg, 10);
}

// ─── Posición en rango de 90 días ───────────────────────────────────────────

/**
 * Devuelve 0-1: qué tan arriba en el rango (low-high de N días) está el
 * precio actual. 0 = en el mínimo, 1 = en el máximo. Útil combinado con
 * ath_distance_pct: queremos tokens que rebotan desde lo bajo del rango.
 */
export function rangePosition(closes: number[], days = 90): number {
  const slice = closes.slice(-days);
  if (!slice.length) return 0.5;
  const low = Math.min(...slice);
  const high = Math.max(...slice);
  if (high === low) return 0.5;
  const current = closes[closes.length - 1];
  return (current - low) / (high - low);
}

// ─── Empaquetador ───────────────────────────────────────────────────────────

/**
 * Calcula TODOS los indicadores técnicos para un token, dado:
 *  - closes: array de cierres diarios (≥30 idealmente)
 *  - volumes: array de volúmenes diarios (mismo length)
 *  - currentVol24h: volumen ya conocido de las últimas 24h
 *  - athDistancePct: ya viene calculado desde antes (de CMC o de price_history)
 *  - futures: opcional, datos de futuros si los hay
 */
export function computeIndicators(args: {
  closes: number[];
  volumes: number[];
  currentVol24h: number;
  athDistancePct: number;
  funding_rate?: number | null;
  oi_change_24h?: number | null;
  has_futures: boolean;
}): TechnicalIndicators {
  return {
    rvol: rvol(args.currentVol24h, args.volumes, 20),
    bb_squeeze: bollingerSqueeze(args.closes, 20, 2, 90),
    rsi: rsi(args.closes, 14),
    rsi_bullish_divergence: detectBullishDivergence(args.closes, 20),
    ath_distance_pct: args.athDistancePct,
    range_position_90d: rangePosition(args.closes, 90),
    funding_rate: args.funding_rate ?? null,
    oi_change_24h: args.oi_change_24h ?? null,
    has_futures: args.has_futures,
  };
}