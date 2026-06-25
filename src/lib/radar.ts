// Lógica de scoring del Radar + actualización de outcomes para el forward-test.
// Funciones puras, no tocan red.

import type {
  TechnicalIndicators,
  RadarScoreBreakdown,
  RadarSignal,
  SignalOutcome,
  ClaudeAgreement,
  RadarPerformance,
  Signal,
  FearGreedIndex,
} from "@/lib/types";

// ─── Pesos del score compuesto ──────────────────────────────────────────────
const WEIGHTS = {
  rvol:           22,  // era 25 — cedemos 3 puntos
  bb_squeeze:     13,  // era 15 — cedemos 2 puntos
  rsi:            18,  // era 20 — cedemos 2 puntos
  range_position: 13,  // era 15 — cedemos 2 puntos
  futures:        18,  // era 20 — cedemos 2 puntos
  fng_modulator:   4,  // era 5  — cedemos 1 punto
  wyckoff:        12,  // NUEVO — total sigue siendo 100
} as const;

// ─── Scorers individuales (cada uno devuelve 0-1) ───────────────────────────

/** RVOL: 1x normal, 2-3x interesante, 4x+ excepcional. Curva suave. */
function scoreRvol(rvol: number): number {
  if (rvol <= 1) return 0;
  if (rvol >= 4) return 1;
  // mapeo no-lineal: 1.5→0.25, 2→0.5, 3→0.85, 4→1
  return Math.min(1, (rvol - 1) / 3);
}

/** Squeeze: directo, ya viene 0-1. */
function scoreSqueeze(sq: number): number {
  return Math.max(0, Math.min(1, sq));
}

/**
 * RSI: zona ideal para alcistas es 30-50 (rebote desde sobreventa).
 * - <30: sobrevendido extremo (0.7)
 * - 30-50: zona dulce (0.8-1)
 * - 50-65: neutral (0.5-0.6)
 * - >65: sobrecomprado, peor (cae a 0.2)
 * Divergencia alcista suma boost.
 */
function scoreRsi(rsi: number, divergence: boolean): number {
  let base: number;
  if (rsi < 30) base = 0.7;
  else if (rsi < 50) base = 0.8 + ((50 - rsi) / 20) * 0.2; // 30→1, 50→0.8
  else if (rsi < 65) base = 0.6 - ((rsi - 50) / 15) * 0.1;
  else base = Math.max(0.1, 0.5 - ((rsi - 65) / 35) * 0.4);

  if (divergence) base = Math.min(1, base + 0.2);
  return base;
}

/**
 * Posición en rango + distancia al ATH combinados.
 * Queremos tokens en la mitad inferior del rango 90d pero ya rebotando
 * (no en el piso absoluto — eso es trampa de gato muerto).
 */
function scoreRangePosition(rangePos: number, athDistancePct: number): number {
  // Posición ideal en rango: 0.2-0.5 (rebote desde abajo)
  let rangeScore: number;
  if (rangePos < 0.1) rangeScore = 0.4; // muy abajo, riesgo de seguir cayendo
  else if (rangePos < 0.5) rangeScore = 1 - Math.abs(0.3 - rangePos) * 2;
  else rangeScore = Math.max(0, 1 - (rangePos - 0.5) * 2); // arriba del 50% = peor

  // ATH distance: ideal entre 30-70% bajo ATH
  let athScore: number;
  if (athDistancePct < 20) athScore = 0.3; // muy cerca del ATH = poco upside
  else if (athDistancePct < 70) athScore = 1 - Math.abs(50 - athDistancePct) / 50;
  else athScore = Math.max(0.2, 1 - (athDistancePct - 70) / 30); // >90% = puede ser zombie

  return (rangeScore + athScore) / 2;
}

/**
 * Futures: funding negativo + OI subiendo = short squeeze setup ideal.
 *  - funding < -0.01% y OI subiendo >5%: 1.0 (señal de libro)
 *  - funding ~0 y OI estable: 0.5 (neutro)
 *  - funding muy positivo (>0.05%): 0.1 (longs euforicos, mala señal contrarian)
 */
function scoreFutures(funding: number | null, oiChange: number | null): number {
  if (funding === null) return 0;
  let score = 0.5;
  // funding component (0-0.6)
  if (funding < -0.0001) score = 0.7 + Math.min(0.3, Math.abs(funding) * 1000);
  else if (funding < 0.0001) score = 0.5;
  else if (funding < 0.0003) score = 0.4;
  else score = Math.max(0.1, 0.4 - (funding - 0.0003) * 500);

  // OI modulator (-0.2 a +0.3)
  if (oiChange !== null) {
    if (oiChange > 5) score = Math.min(1, score + 0.3);
    else if (oiChange > 0) score = Math.min(1, score + 0.15);
    else if (oiChange < -10) score = Math.max(0, score - 0.2);
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * Fear & Greed como modulador. En "Extreme Fear" (mercado deprimido) las
 * señales alcistas son contrarianamente más valiosas. En "Extreme Greed" hay
 * que descontarlas.
 */
function scoreFng(fng: FearGreedIndex | null): number {
  if (!fng) return 0.5;
  // 0-25: Extreme Fear → 1 (contrarian bull)
  // 25-50: Fear → 0.75
  // 50-75: Greed → 0.4
  // 75-100: Extreme Greed → 0.2
  if (fng.value < 25) return 1;
  if (fng.value < 50) return 0.75;
  if (fng.value < 75) return 0.4;
  return 0.2;
}

// ─── Wyckoff compuesto ─────────────────────────────────────────────────────────
/*
 * Combina las 4 señales en un score 0-1.
 * Spring en acumulación = máximo puntaje. UTAD en distribución = penaliza.
 */
function scoreWyckoff(ind: TechnicalIndicators): number {
  let score = 0.5; // neutro por defecto

  // Trading Range activo (< 8% amplitud) → contexto favorable
  if (ind.wyckoff_tr_width < 0.08) score += 0.15;
  else if (ind.wyckoff_tr_width > 0.20) score -= 0.15;

  // Tendencia previa: acumulación requiere caída previa
  if (ind.wyckoff_prior_trend === "down") score += 0.15;
  else if (ind.wyckoff_prior_trend === "up") score -= 0.10;

  // Esfuerzo vs Resultado: absorción alta = señal positiva
  if (ind.wyckoff_effort_vs_result > 0.3) score += 0.15;

  // Spring/UTAD: spring es la señal más fuerte, UTAD penaliza
  if (ind.wyckoff_spring_utad === "spring") score += 0.20;
  else if (ind.wyckoff_spring_utad === "utad") score -= 0.25;

  return Math.max(0, Math.min(1, score));
}

// ─── Score compuesto ─────────────────────────────────────────────────────────

export function computeRadarScore(
  ind: TechnicalIndicators,
  fng: FearGreedIndex | null,
): { breakdown: RadarScoreBreakdown; reasons: string[] } {
  const rvolS    = scoreRvol(ind.rvol);
  const squeezeS = scoreSqueeze(ind.bb_squeeze);
  const rsiS     = scoreRsi(ind.rsi, ind.rsi_bullish_divergence);
  const rangeS   = scoreRangePosition(ind.range_position_90d, ind.ath_distance_pct);
  const futuresS = scoreFutures(ind.funding_rate, ind.oi_change_24h);
  const fngS     = scoreFng(fng);
  const wyckoffS = scoreWyckoff(ind);

  // Redistribución: si no hay futures, los 20 puntos de futures se reparten
  // proporcionalmente entre los otros 4 indicadores principales (rvol, squeeze,
  // rsi, range — no F&G, que es modulador).
  let total: number;
  if (ind.has_futures) {
    total =
      rvolS    * WEIGHTS.rvol +
      squeezeS * WEIGHTS.bb_squeeze +
      rsiS     * WEIGHTS.rsi +
      rangeS   * WEIGHTS.range_position +
      futuresS * WEIGHTS.futures +
      fngS     * WEIGHTS.fng_modulator +
      wyckoffS * WEIGHTS.wyckoff;
  } else {
    // El mult ahora es sobre 88 (sin futures ni wyckoff) → redistribuye a 96
    const mult = 96 / 70;
    total =
      (rvolS    * WEIGHTS.rvol +
      squeezeS * WEIGHTS.bb_squeeze +
      rsiS     * WEIGHTS.rsi +
      rangeS   * WEIGHTS.range_position) * mult +
      fngS     * WEIGHTS.fng_modulator +
      wyckoffS * WEIGHTS.wyckoff;
  }

  const breakdown: RadarScoreBreakdown = {
    rvol:           +(rvolS    * WEIGHTS.rvol).toFixed(1),
    bb_squeeze:     +(squeezeS * WEIGHTS.bb_squeeze).toFixed(1),
    rsi:            +(rsiS     * WEIGHTS.rsi).toFixed(1),
    range_position: +(rangeS   * WEIGHTS.range_position).toFixed(1),
    futures:        +(futuresS * WEIGHTS.futures).toFixed(1),
    fng_modulator:  +(fngS     * WEIGHTS.fng_modulator).toFixed(1),
    total:          Math.round(Math.max(0, Math.min(100, total))),
    wyckoff: +(wyckoffS * WEIGHTS.wyckoff).toFixed(1),
  };

  // Razones legibles (chips para la UI)
  const reasons: string[] = [];
  if (ind.rvol >= 2) reasons.push(`RVOL ${ind.rvol.toFixed(1)}x`);
  if (ind.bb_squeeze >= 0.7) reasons.push(`Squeeze ${ind.bb_squeeze.toFixed(2)}`);
  if (ind.rsi < 35) reasons.push(`RSI sobrevendido (${Math.round(ind.rsi)})`);
  else if (ind.rsi < 50 && ind.rsi_bullish_divergence) reasons.push("Divergencia RSI alcista");
  if (ind.range_position_90d < 0.3) reasons.push(`Cerca del low 90d`);
  if (ind.ath_distance_pct >= 50 && ind.ath_distance_pct <= 75) {
    reasons.push(`${Math.round(ind.ath_distance_pct)}% bajo ATH`);
  }
  if (ind.has_futures && ind.funding_rate !== null && ind.funding_rate < -0.0001) {
    reasons.push(`Funding ${(ind.funding_rate * 100).toFixed(3)}%`);
  }
  if (ind.has_futures && ind.oi_change_24h !== null && ind.oi_change_24h > 5) {
    reasons.push(`OI +${ind.oi_change_24h.toFixed(1)}%`);
  }
  if (fng && fng.value < 25) reasons.push(`F&G ${fng.value} (Extreme Fear)`);
  if (ind.wyckoff_spring_utad === "spring") reasons.push("Spring detectado 🟢");
  if (ind.wyckoff_spring_utad === "utad")   reasons.push("UTAD detectado 🔴");
  if (ind.wyckoff_tr_width < 0.08 && ind.wyckoff_prior_trend === "down")
    reasons.push("Rango acumulación Wyckoff");

  return { breakdown, reasons };
}

// ─── Disenso con Claude ─────────────────────────────────────────────────────

export function computeAgreement(
  technicalScore: number,
  claudeSignal: Signal | null,
): ClaudeAgreement {
  if (!claudeSignal) return "NEUTRAL";
  const technicalBullish = technicalScore >= 65;
  const technicalBearish = technicalScore < 30;

  if (claudeSignal === "ACUMULAR" && technicalBullish) return "AGREE";
  if (claudeSignal === "EVITAR" && technicalBearish) return "AGREE";
  if (claudeSignal === "EVITAR" && technicalBullish) return "DISAGREE_BULL";
  if (claudeSignal === "ACUMULAR" && technicalBearish) return "DISAGREE_BEAR";
  return "NEUTRAL";
}

// ─── Forward-test: actualizar outcomes ──────────────────────────────────────

/**
 * Dada una señal antigua y el precio actual del token, actualiza los outcomes
 * apropiados según cuánto tiempo pasó desde la detección.
 *
 * Regla: una vez que un horizonte se "cierra" (pasaron sus N días), queda
 * congelado. No se sobreescribe en escaneos posteriores.
 */
export function updateOutcome(
  signal: RadarSignal,
  currentPrice: number,
  now: number = Date.now(),
): SignalOutcome {
  const prev = signal.outcomes ?? {
    closed_7d: false,
    closed_14d: false,
    closed_30d: false,
    last_observed_at: signal.detected_at,
    last_observed_price: signal.detection_price,
  };

  const daysElapsed = (now - signal.detected_at) / (1000 * 60 * 60 * 24);
  const changePct =
    signal.detection_price > 0
      ? ((currentPrice - signal.detection_price) / signal.detection_price) * 100
      : 0;

  const next: SignalOutcome = { ...prev };

  // Actualizar peak si corresponde
  if (prev.peak_pct === undefined || changePct > prev.peak_pct) {
    next.peak_pct = +changePct.toFixed(2);
    next.days_to_peak = +daysElapsed.toFixed(1);
  }

  // Cierre de horizonte 7d
  if (!prev.closed_7d && daysElapsed >= 7) {
    next.price_7d = currentPrice;
    next.change_7d_pct = +changePct.toFixed(2);
    next.closed_7d = true;
  } else if (!prev.closed_7d) {
    // mantenemos provisional
    next.price_7d = currentPrice;
    next.change_7d_pct = +changePct.toFixed(2);
  }

  // Cierre 14d
  if (!prev.closed_14d && daysElapsed >= 14) {
    next.price_14d = currentPrice;
    next.change_14d_pct = +changePct.toFixed(2);
    next.closed_14d = true;
  } else if (!prev.closed_14d) {
    next.price_14d = currentPrice;
    next.change_14d_pct = +changePct.toFixed(2);
  }

  // Cierre 30d
  if (!prev.closed_30d && daysElapsed >= 30) {
    next.price_30d = currentPrice;
    next.change_30d_pct = +changePct.toFixed(2);
    next.closed_30d = true;
  } else if (!prev.closed_30d) {
    next.price_30d = currentPrice;
    next.change_30d_pct = +changePct.toFixed(2);
  }

  next.last_observed_at = now;
  next.last_observed_price = currentPrice;
  return next;
}

// ─── Performance agregada ───────────────────────────────────────────────────

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function computePerformance(signals: RadarSignal[]): RadarPerformance {
  const closed7  = signals.filter((s) => s.outcomes?.closed_7d);
  const closed14 = signals.filter((s) => s.outcomes?.closed_14d);
  const closed30 = signals.filter((s) => s.outcomes?.closed_30d);

  const changes7  = closed7.map((s) => s.outcomes!.change_7d_pct!).filter((n) => !isNaN(n));
  const changes14 = closed14.map((s) => s.outcomes!.change_14d_pct!).filter((n) => !isNaN(n));
  const changes30 = closed30.map((s) => s.outcomes!.change_30d_pct!).filter((n) => !isNaN(n));

  const hitRate = (arr: number[]): number | null =>
    arr.length === 0 ? null : (arr.filter((n) => n > 0).length / arr.length) * 100;

  const avg = (arr: number[]): number | null =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

  let best: RadarSignal | null = null;
  let worst: RadarSignal | null = null;
  for (const s of closed7) {
    const c = s.outcomes!.change_7d_pct!;
    if (best === null || c > best.outcomes!.change_7d_pct!) best = s;
    if (worst === null || c < worst.outcomes!.change_7d_pct!) worst = s;
  }

  return {
    total_signals: signals.length,
    signals_with_7d_outcome: closed7.length,
    signals_with_14d_outcome: closed14.length,
    signals_with_30d_outcome: closed30.length,
    hit_rate_7d:  hitRate(changes7),
    hit_rate_14d: hitRate(changes14),
    hit_rate_30d: hitRate(changes30),
    avg_change_7d:  avg(changes7),
    avg_change_14d: avg(changes14),
    avg_change_30d: avg(changes30),
    median_change_7d: changes7.length ? median(changes7) : null,
    best_signal: best,
    worst_signal: worst,
  };
}