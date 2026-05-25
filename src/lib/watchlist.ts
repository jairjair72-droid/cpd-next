// Funciones puras de la Watchlist. Sin red, sin UI, testeables aisladas.

import type {
  Signal,
  WatchlistEntry,
  WatchlistSnapshot,
  WatchlistAlert,
  WatchlistStats,
} from "@/lib/types";
import { SIGNAL_RANK } from "@/lib/constants";

// ─── Performance personal (desde added_at) ─────────────────────────────────

/**
 * % cambio del precio actual respecto al precio cuando se agregó a la watchlist.
 * Devuelve null si no hay precio actual o el added_price es inválido.
 */
export function pctSinceAdded(
  entry: WatchlistEntry,
  currentPrice: number | undefined,
): number | null {
  if (!currentPrice || entry.added_price <= 0) return null;
  return ((currentPrice - entry.added_price) / entry.added_price) * 100;
}

/** Stats agregadas de toda la watchlist. */
export function computeStats(
  entries: WatchlistEntry[],
  priceMap: Map<string, number>,
): WatchlistStats {
  if (!entries.length) {
    return {
      total: 0,
      winners_since_added: 0,
      losers_since_added: 0,
      avg_pct_since_added: 0,
      best_performer: null,
      worst_performer: null,
    };
  }

  const withPct = entries
    .map((e) => ({ symbol: e.symbol, pct: pctSinceAdded(e, priceMap.get(e.symbol)) }))
    .filter((x): x is { symbol: string; pct: number } => x.pct !== null);

  if (!withPct.length) {
    return {
      total: entries.length,
      winners_since_added: 0,
      losers_since_added: 0,
      avg_pct_since_added: 0,
      best_performer: null,
      worst_performer: null,
    };
  }

  const winners = withPct.filter((x) => x.pct > 0).length;
  const losers = withPct.filter((x) => x.pct < 0).length;
  const avg = withPct.reduce((sum, x) => sum + x.pct, 0) / withPct.length;
  const sorted = [...withPct].sort((a, b) => b.pct - a.pct);

  return {
    total: entries.length,
    winners_since_added: winners,
    losers_since_added: losers,
    avg_pct_since_added: +avg.toFixed(2),
    best_performer: sorted[0] ?? null,
    worst_performer: sorted[sorted.length - 1] ?? null,
  };
}

// ─── Detección de cambios y generación de alertas ──────────────────────────

/**
 * Compara un snapshot nuevo de un token con el anterior y genera alertas
 * si corresponden. Usa los umbrales que el usuario configuró + cambios
 * automáticos relevantes (signal_change, price_spike).
 *
 * IMPORTANTE: las alertas se generan SOLO si hay snapshot previo. La primera
 * vez que un token entra a la watchlist no dispara nada (no tenés con qué comparar).
 */
export function deriveAlerts(
  entry: WatchlistEntry,
  newSnapshot: WatchlistSnapshot,
  previousSnapshot: WatchlistSnapshot | null,
): WatchlistAlert[] {
  const alerts: WatchlistAlert[] = [];
  const baseId = `${entry.symbol}-${newSnapshot.ts}`;

  // Umbral de score técnico — se dispara cuando CRUZA el umbral (no cada vez
  // que está por encima)
  if (
    entry.threshold_score !== undefined &&
    previousSnapshot &&
    newSnapshot.technical_score !== null &&
    previousSnapshot.technical_score !== null
  ) {
    const prev = previousSnapshot.technical_score;
    const curr = newSnapshot.technical_score;
    const t = entry.threshold_score;
    if (prev < t && curr >= t) {
      alerts.push({
        id: `${baseId}-threshold-up`,
        ts: newSnapshot.ts,
        symbol: entry.symbol,
        type: "threshold_score",
        message: `Score técnico cruzó ${t} (${prev} → ${curr})`,
        read: false,
      });
    }
  }

  // Umbral de señal de Claude — dispara cuando alcanza o supera el umbral
  if (
    entry.threshold_signal !== undefined &&
    previousSnapshot &&
    newSnapshot.claude_signal &&
    previousSnapshot.claude_signal
  ) {
    const want = SIGNAL_RANK[entry.threshold_signal];
    const prev = SIGNAL_RANK[previousSnapshot.claude_signal];
    const curr = SIGNAL_RANK[newSnapshot.claude_signal];
    if (prev < want && curr >= want) {
      alerts.push({
        id: `${baseId}-threshold-signal`,
        ts: newSnapshot.ts,
        symbol: entry.symbol,
        type: "threshold_signal",
        message: `Claude alcanzó ${newSnapshot.claude_signal} (era ${previousSnapshot.claude_signal})`,
        read: false,
      });
    }
  }

  // Cambio de señal de Claude — siempre lo loggeamos aunque no haya umbral
  if (
    previousSnapshot?.claude_signal &&
    newSnapshot.claude_signal &&
    previousSnapshot.claude_signal !== newSnapshot.claude_signal
  ) {
    const arrow =
      SIGNAL_RANK[newSnapshot.claude_signal] > SIGNAL_RANK[previousSnapshot.claude_signal]
        ? "↗"
        : "↘";
    alerts.push({
      id: `${baseId}-signal-change`,
      ts: newSnapshot.ts,
      symbol: entry.symbol,
      type: "signal_change",
      message: `Señal: ${previousSnapshot.claude_signal} ${arrow} ${newSnapshot.claude_signal}`,
      read: false,
    });
  }

  // Price spike — variación grande respecto al snapshot anterior
  if (previousSnapshot && previousSnapshot.price > 0) {
    const pct = ((newSnapshot.price - previousSnapshot.price) / previousSnapshot.price) * 100;
    if (Math.abs(pct) >= 5) {
      alerts.push({
        id: `${baseId}-price-spike`,
        ts: newSnapshot.ts,
        symbol: entry.symbol,
        type: "price_spike",
        message: `Precio ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% desde último escaneo`,
        read: false,
      });
    }
  }

  return alerts;
}

// ─── Helpers de manipulación del historial ──────────────────────────────────

/**
 * Agrega un snapshot al historial limitando el tamaño por símbolo a `maxPerSymbol`
 * entradas. Mantiene los más recientes.
 */
export function appendSnapshot(
  history: WatchlistSnapshot[],
  newSnapshot: WatchlistSnapshot,
  maxPerSymbol = 200,
): WatchlistSnapshot[] {
  const ofSymbol = history.filter((s) => s.symbol === newSnapshot.symbol);
  const others = history.filter((s) => s.symbol !== newSnapshot.symbol);
  const updated = [...ofSymbol, newSnapshot]
    .sort((a, b) => a.ts - b.ts)
    .slice(-maxPerSymbol);
  return [...others, ...updated];
}

/** Devuelve los snapshots de un símbolo en orden cronológico. */
export function snapshotsOf(
  history: WatchlistSnapshot[],
  symbol: string,
): WatchlistSnapshot[] {
  return history
    .filter((s) => s.symbol === symbol)
    .sort((a, b) => a.ts - b.ts);
}

/** El snapshot más reciente de un símbolo, o null si no hay. */
export function latestSnapshotOf(
  history: WatchlistSnapshot[],
  symbol: string,
): WatchlistSnapshot | null {
  const arr = snapshotsOf(history, symbol);
  return arr.length ? arr[arr.length - 1] : null;
}

/** Devuelve true si el símbolo ya está en la watchlist. */
export function isInWatchlist(entries: WatchlistEntry[], symbol: string): boolean {
  return entries.some((e) => e.symbol === symbol.toUpperCase());
}