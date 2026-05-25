// Lógica pura de la narrativa. Sin red, sin UI.

import type {
  RadarSignal,
  NarrativeEntry,
  TechnicalIndicators,
} from "@/lib/types";

/**
 * Genera un "fingerprint" de los indicadores de un token. Lo usamos para el
 * cache: si el fingerprint no cambió respecto a la narrativa previa, no vale
 * la pena re-llamar a Claude (los datos son básicamente los mismos).
 *
 * Redondeamos a propósito para que cambios mínimos no invaliden el cache:
 *  - RVOL a 1 decimal
 *  - squeeze / rsi a enteros
 *  - funding a 4 decimales
 *  - score a múltiplos de 5
 */
export function indicatorsFingerprint(
  ind: TechnicalIndicators,
  technicalScore: number,
): string {
  const parts = [
    `rv${ind.rvol.toFixed(1)}`,
    `sq${Math.round(ind.bb_squeeze * 100)}`,
    `rsi${Math.round(ind.rsi)}`,
    `div${ind.rsi_bullish_divergence ? 1 : 0}`,
    `rng${Math.round(ind.range_position_90d * 100)}`,
    `fund${ind.funding_rate !== null ? ind.funding_rate.toFixed(4) : "na"}`,
    `oi${ind.oi_change_24h !== null ? Math.round(ind.oi_change_24h) : "na"}`,
    `sc${Math.round(technicalScore / 5) * 5}`,
  ];
  return parts.join("|");
}

/**
 * Decide qué señales del último escaneo merecen narrativa individual.
 * Top 5 por score técnico. Filtra señales con score muy bajo (< 30) porque
 * narrar un token técnicamente flojo no aporta.
 */
export function selectTopForNarrative(
  signals: RadarSignal[],
  latestScanTs: number,
  limit = 5,
): RadarSignal[] {
  const cutoff = latestScanTs - 5 * 60 * 1000;
  return signals
    .filter((s) => s.detected_at >= cutoff && s.technical_score >= 30)
    .sort((a, b) => b.technical_score - a.technical_score)
    .slice(0, limit);
}

/**
 * Dado el set de narrativas previas y una señal, decide si hay que regenerar
 * la narrativa o si podemos reusar la del cache.
 *
 * Reusa si: existe narrativa previa para ese símbolo Y el fingerprint coincide
 * Y la narrativa tiene menos de `maxAgeMs` (default 6h — más viejo se regenera
 * aunque no haya cambiado, para que no quede stale eternamente).
 */
export function shouldReuseNarrative(
  previous: NarrativeEntry | undefined,
  currentFingerprint: string,
  maxAgeMs = 6 * 60 * 60 * 1000,
): boolean {
  if (!previous) return false;
  if (previous.indicators_fingerprint !== currentFingerprint) return false;
  if (Date.now() - previous.generated_at > maxAgeMs) return false;
  return true;
}

/** Devuelve la narrativa de un símbolo desde el array, o undefined. */
export function findNarrative(
  narratives: NarrativeEntry[],
  symbol: string,
): NarrativeEntry | undefined {
  return narratives.find((n) => n.symbol === symbol);
}