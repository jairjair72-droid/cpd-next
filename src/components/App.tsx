"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { COLORS, SIG_COLOR, RISK_DOT } from "@/lib/constants";
import { fmtUSD } from "@/lib/formatters";
import {
  analyze,
  analyzeStream,
  enrichToken,
  getBinanceTickers,
  getKlines,
  getMarketMap,
  sendTelegram,
  getFuturesData,
  getFearGreed,
  withRetry,
  isPermanentError,
  narrateToken,
  narrateGlobal,
} from "@/lib/client/api";
import type {
  Alert,
  ApiStatus,
  CandidateToken,
  ScanHistoryEntry,
  ScanLogEntry,
  Signal,
  TelegramSent,
  RadarSignal,
  FearGreedIndex,
  WatchlistEntry, 
  WatchlistSnapshot, 
  WatchlistAlert,
  NarrativeEntry, 
  GlobalNarrative,
} from "@/lib/types";
import {
  indicatorsFingerprint,
  selectTopForNarrative,
  shouldReuseNarrative,
  findNarrative,
} from "@/lib/narrative";
import { useLocalStorage } from "@/lib/client/storage";
import DashRow from "@/components/DashRow";
import GlobalMetricsBar from "@/components/GlobalMetricsBar";
import ApiKeyOverrideCard from "@/components/ApiKeyOverrideCard";
import ThemeToggle from "@/components/ThemeToggle";
import { computeIndicators, isLikelyStablecoin } from "@/lib/indicators";
import { computeRadarScore, computeAgreement, updateOutcome } from "@/lib/radar";
import DiscoverPanel from "@/components/DiscoverPanel";
import TelegramPanel from "@/components/TelegramPanel";
import RadarPanel from "@/components/RadarPanel";
import WatchlistPanel from "@/components/WatchlistPanel";
import NotificationBell from "@/components/NotificationBell";
import ApiStatusInline from "@/components/ApiStatusInline";
import { appendSnapshot, deriveAlerts, latestSnapshotOf } from "@/lib/watchlist";
import type { SymbolEntry } from "@/lib/client/api";
import NarrativeBanner from "./NarrativeBanner";
import WyckoffPanel from "./WyckoffPanel";

const { BG, CARD, BORDER, TEXT, SUB, MUTED, ACCENT, ORANGE, GREEN } = COLORS;
const cardStyle: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: "14px 16px",
};

type ApiName = keyof ApiStatus;
type Tab = "dashboard" | "alertas" | "learning" | "ajustes";

export default function App() {
  // ─── Estado principal ───────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>("dashboard");

  // Persistido en localStorage (sobreviven recarga de página)
  const [candidates, setCandidates] = useLocalStorage<CandidateToken[]>("cpd_candidates", []);
  const [alerts, setAlerts] = useLocalStorage<Alert[]>("cpd_alerts", []);
  const [history, setHistory] = useLocalStorage<ScanHistoryEntry[]>("cpd_history", []);
  const [tgSentLog, setTgSentLog] = useLocalStorage<TelegramSent[]>("cpd_tg_log", []);
  const [tgToken, setTgToken] = useLocalStorage<string>("cpd_tg_token", "");
  const [tgChat, setTgChat] = useLocalStorage<string>("cpd_tg_chat", "");
  const [capital, setCapital] = useLocalStorage<number>("cpd_capital", 500);
  const [autoTrade, setAutoTrade] = useLocalStorage<boolean>("cpd_autotrade", false);
  const [topN, setTopN] = useLocalStorage<number>("cpd_topn", 40);
  const [useStreaming, setUseStreaming] = useLocalStorage<boolean>("cpd_streaming", false);
  // ─── Radar (forward-test del módulo de señales) ─────────────────────────
  const [radarSignals, setRadarSignals] = useLocalStorage<RadarSignal[]>("cpd_radar_signals", []);
  const [fng, setFng] = useLocalStorage<FearGreedIndex | null>("cpd_fng", null);
  // ─── Watchlist ─────────────────────────
  const [watchlist, setWatchlist] = useLocalStorage<WatchlistEntry[]>("cpd_watchlist", []);
  const [watchHistory, setWatchHistory] = useLocalStorage<WatchlistSnapshot[]>("cpd_watch_history", []);
  const [watchAlerts, setWatchAlerts] = useLocalStorage<WatchlistAlert[]>("cpd_watch_alerts", []);
  const [lastEventsReadTs, setLastEventsReadTs] = useLocalStorage<number>("cpd_last_events_read", 0);
  // ─── Narrative ─────────────────────────
  const [narratives, setNarratives] = useLocalStorage<NarrativeEntry[]>("cpd_narratives", []);
  const [globalNarrative, setGlobalNarrative] = useLocalStorage<GlobalNarrative | null>("cpd_global_narrative", null);
  const [klineMap, setKlineMap] = useLocalStorage<Record<string, { opens: number[]; highs: number[]; lows: number[]; closes: number[]; volumes: number[] } | null>>("cpd_kline_map", {});

  // Estado efímero (no se persiste — son cosas de la sesión actual)
  const [searchQuery, setSearchQuery] = useState("");
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [nextScanIn, setNextScanIn] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [apiError, setApiError] = useState("");
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    binance:    { ok: null, ts: null },
    marketdata: { ok: null, ts: null },
    anthropic:  { ok: null, ts: null },
  });
  // Foco por fila — indexado por número de fila. Escalable a N filas.
  // Estructura: { [rowNumber]: panelId | null }
  const [rowFocus, setRowFocus] = useState<Record<number, string | null>>({});
  const [stablecoinFilterEnabled, setStablecoinFilterEnabled] = useLocalStorage<boolean>("cpd_stablecoin_filter", true);

  // Handler
  const setFocusForRow = useCallback((rowNumber: number, panelId: string | null) => {
    setRowFocus((prev) => ({ ...prev, [rowNumber]: panelId }));
  }, []);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const autoScanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const scanning$ = useRef(false);

  // ─── Helpers ────────────────────────────────────────────────────────────
  const log = useCallback((msg: string, type: ScanLogEntry["type"] = "info") =>
    setScanLog((p) => [
      ...p.slice(-60),
      {
        msg,
        type,
        t: new Date().toLocaleTimeString("es", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      },
    ]), []);

  const markApi = useCallback((api: ApiName, ok: boolean) => {
    setApiStatus((prev) => ({ ...prev, [api]: { ok, ts: Date.now() } }));
  }, []);

  const addToWatchlist = useCallback(
    (s: SymbolEntry, currentPrice: number | undefined) => {
      setWatchlist((prev) => {
        if (prev.some((e) => e.symbol === s.symbol)) return prev;
        return [
          ...prev,
          {
            symbol: s.symbol,
            binanceSymbol: s.binanceSymbol,
            added_at: Date.now(),
            added_price: currentPrice ?? 0,
          },
        ];
      });
    },
    [setWatchlist],
  );

  const removeFromWatchlist = useCallback(
    (symbol: string) => {
      setWatchlist((prev) => prev.filter((e) => e.symbol !== symbol));
    },
    [setWatchlist],
  );

  const updateWatchlistEntry = useCallback(
    (symbol: string, updates: Partial<WatchlistEntry>) => {
      setWatchlist((prev) =>
        prev.map((e) => (e.symbol === symbol ? { ...e, ...updates } : e)),
      );
    },
    [setWatchlist],
  );

  // ─── Discover (scan completo) ───────────────────────────────────────────
  const runDiscover = useCallback(async () => {
    if (scanning$.current) return;
    scanning$.current = true;
    setScanning(true);
    setProgress(0);
    setScanLog([]);
    setApiError("");
    setExpandedId(null);
    setSearchQuery("");

    setCandidates([]);

    log("Conectando con Binance...", "info");

    // ★ Estructura para guardar todo lo que necesitamos al final para armar señales
    type PoolItem = ReturnType<typeof enrichToken>;
    let pool: PoolItem[] = [];
    let klineMap: Awaited<ReturnType<typeof getKlines>> = {};
    let futuresMap: Record<string, Awaited<ReturnType<typeof getFuturesData>>[string]> = {};
    let currentFng: FearGreedIndex | null = null;

    try {
      const allTickers = await getBinanceTickers();
      markApi("binance", true);
      // Top N + watchlist (deduplicado por símbolo)
      const topNTickers = allTickers.slice(0, topN);
      const watchlistTickers = allTickers.filter(
        (t) => watchlist.some((w) => w.symbol === t.symbol) && !topNTickers.some((tn) => tn.symbol === t.symbol),
      );
      const selected = [...topNTickers, ...watchlistTickers];
      if (watchlistTickers.length > 0) {
        log(`👁️ ${watchlistTickers.length} tokens extra de watchlist`, "info");
      }
      log(
        `✅ ${allTickers.length} pares USDT encontrados → analizando top ${selected.length} por volumen`,
        "hit",
      );

      log("Descargando metadata (CoinMarketCap → fallback CoinGecko)...", "info");
      const { markets, source } = await getMarketMap();
      markApi("marketdata", Object.keys(markets).length > 0);
      const found_md = selected.filter((t) => markets[t.symbol]).length;
      log(
        `✅ Coincidencias en ${source === "cmc" ? "CoinMarketCap" : "CoinGecko"}: ${found_md}/${selected.length}`,
        "hit",
      );

      log("Descargando historial de precios (30d) en paralelo...", "info");
      klineMap = await getKlines(selected.map((t) => t.binanceSymbol), "1d", 30);
      setKlineMap(klineMap);
      // ★ NUEVO: traemos también velas con volumen para el RVOL.
      // Reutilizamos las mismas velas — Binance devuelve OHLCV en /klines,
      // pero `getKlines` actual solo extrae closes. Por compatibilidad, simulamos
      // los volúmenes a partir del volumen actual del ticker (aproximación
      // razonable para el período hasta que migremos klines a OHLCV completo).

      pool = selected.map((t, i) => enrichToken(t, i, markets, klineMap));

      if (stablecoinFilterEnabled) {
        const before = pool.length;
        pool = pool.filter((t) => {
          const k = klineMap[t.binanceSymbol];
          if (!k || !k.closes.length) return true;
          return !isLikelyStablecoin(k.closes);
        });     
        const filtered = before - pool.length;
        if (filtered > 0) {
          log(`🪙 ${filtered} posibles stablecoins excluidas (volatilidad <2.5%)`, "info");
        }
      }

      // ★ NUEVO: traemos Futures y Fear & Greed en paralelo
      log("Descargando Futures (funding + OI) y Fear & Greed...", "info");
      const [futuresResult, fngResult] = await Promise.all([
        getFuturesData(selected.map((t) => t.binanceSymbol)).catch((e) => {
          log(`⚠ Futures falló: ${e instanceof Error ? e.message : "?"}`, "warn");
          return {} as typeof futuresMap;
        }),
        getFearGreed().catch((e) => {
          log(`⚠ F&G falló: ${e instanceof Error ? e.message : "?"}`, "warn");
          return null;
        }),
      ]);
      futuresMap = futuresResult;
      currentFng = fngResult;
      if (currentFng) {
        setFng(currentFng);
        const withFutures = Object.values(futuresMap).filter((f) => f.available).length;
        log(`✅ Futures: ${withFutures}/${selected.length} contratos · F&G ${currentFng.value} (${currentFng.classification})`, "hit");
      }

      log("Iniciando análisis con Claude (vía /api/analyze)...", "info");
    } catch (err) {
      markApi("binance", false);
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setApiError("Error obteniendo datos: " + msg);
      log(`❌ ${msg}`, "warn");
      setScanning(false);
      scanning$.current = false;
      return;
    }

    const found: CandidateToken[] = [];
    // ★ NUEVO: acumulamos las señales del Radar de este escaneo
    const newRadarSignals: RadarSignal[] = [];

    try {
      for (let i = 0; i < pool.length; i++) {
        if (!scanning$.current) break;
        const tok = pool[i];
        setProgress(Math.round(((i + 1) / pool.length) * 100));
        log(
          `[${i + 1}/${pool.length}] ${tok.symbol} — ${fmtUSD(tok.vol24h)} vol · ${tok.change_7d >= 0 ? "+" : ""}${tok.change_7d}% 7d`,
          "scan",
        );

        let res = null;
        const tokenPayload = {
          symbol: tok.symbol,
          price: tok.price,
          mcap_usd: tok.mcap_usd,
          vol24h: tok.vol24h,
          vol_mcap_ratio: tok.vol_mcap_ratio,
          age_days: tok.age_days,
          change_7d: tok.change_7d,
          change_30d: tok.change_30d,
          whale_concentration: tok.whale_concentration,
          wallet_growth_30d: tok.wallet_growth_30d,
          exchange_netflow: tok.exchange_netflow,
          social_score: tok.social_score,
          multi_exchange: tok.multi_exchange,
          ath_distance_pct: tok.ath_distance_pct,
        };

        try {
          // Con retry + backoff: hasta 3 intentos por token. Errores transitorios
          // (529 overloaded, 5xx, red) se reintentan automáticamente con esperas
          // de 1s, 3s, 8s. Errores permanentes (400, auth) abortan sin reintentar.
          res = await withRetry(
            () => {
              if (useStreaming) {
                let firstDelta = true;
                return analyzeStream(tokenPayload, () => {
                  if (firstDelta) {
                    firstDelta = false;
                    log(`   ↳ ${tok.symbol}: streaming...`, "info");
                  }
                });
              }
              return analyze(tokenPayload);
            },
            {
              attempts: 1,
              delays: [1000, 3000, 8000],
              shouldGiveUp: isPermanentError,
              onRetry: (attempt, err, delayMs) => {
                const msg = err instanceof Error ? err.message : "?";
                log(
                  `⏳ ${tok.symbol}: intento ${attempt}/3 falló (${msg.slice(0, 50)}) — reintentando en ${delayMs / 1000}s`,
                  "warn",
                );
              },
            },
          );
          markApi("anthropic", true);
        } catch (err) {
          // Después de agotar los reintentos, skipeamos ESTE token pero seguimos
          // con los siguientes. Antes esto rompía el escaneo entero.
          markApi("anthropic", false);
          const msg = err instanceof Error ? err.message : "?";
          log(`❌ ${tok.symbol}: descartado tras 3 intentos fallidos (${msg.slice(0, 60)})`, "warn");
          // Continuamos con el próximo token del loop
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        // ★ NUEVO: armamos la señal del Radar para ESTE token, independiente de
        // si Claude lo aprobó o no. El Radar es "universal" sobre los escaneados.
        try {
          const k = klineMap[tok.binanceSymbol];
          const closes = k?.closes ?? [];
          const volumes = k?.volumes ?? [];
          const fut = futuresMap[tok.binanceSymbol];
          if (closes.length >= 20) {
            const indicators = computeIndicators({
              closes,
              volumes,
              currentVol24h: tok.vol24h,
              athDistancePct: tok.ath_distance_pct,
              funding_rate: fut?.available ? fut.funding_rate : null,
              oi_change_24h: fut?.available ? fut.open_interest_change_24h : null,
              has_futures: !!fut?.available,
            });
            const { breakdown, reasons } = computeRadarScore(indicators, currentFng);
            const claudeSignal: Signal | null = res?.signal ?? null;
            const agreement = computeAgreement(breakdown.total, claudeSignal);

            newRadarSignals.push({
              id: `${tok.symbol}-${Date.now()}-${i}`,
              symbol: tok.symbol,
              detected_at: Date.now(),
              detection_price: tok.price,
              technical_score: breakdown.total,
              breakdown,
              reasons,
              indicators,
              claude_signal: claudeSignal,
              claude_score: res?.score ?? null,
              agreement,
            });
          }
        } catch (radarErr) {
          // No queremos que un error del Radar rompa el escaneo entero
          log(`⚠ Radar: ${tok.symbol} — ${radarErr instanceof Error ? radarErr.message : "?"}`, "warn");
        }

        if (res && res.score !== undefined) {
          const enriched: CandidateToken = { ...tok, ...res };
          if (res.signal !== "EVITAR") {
            found.push(enriched);
            log(
              `✅ ${tok.symbol} Score:${res.score} ${res.signal} (${res.risk})`,
              "hit",
            );
            setAlerts((p) => [
              {
                id: Date.now() + i,
                symbol: tok.symbol,
                score: res.score,
                signal: res.signal,
                reason: res.reason,
                type: res.type,
                risk: res.risk,
                time: new Date().toLocaleTimeString("es", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                exchange: "Binance",
              },
              ...p.slice(0, 49),
            ]);
            setCandidates([...found]);
          } else {
            log(`— ${tok.symbol} descartado (score ${res.score})`, "skip");
          }
        } else {
          log(`⚠️ ${tok.symbol} — respuesta no parseable`, "warn");
        }

        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de API";
      setApiError(msg);
      log(`❌ Error: ${msg}`, "warn");
    }

    // ★ NUEVO: actualizamos outcomes de señales viejas + agregamos las nuevas
    //
    // Lógica:
    // 1. Para cada señal vieja del Radar, si tenemos el precio actual de ese
    //    token en este escaneo, actualizamos su outcome (provisional o cerrado).
    // 2. Agregamos las nuevas señales al stack.
    // 3. Limpiamos señales muy viejas (>90 días) para no inflar localStorage.
    const currentPriceMap = new Map(pool.map((p) => [p.symbol, p.price]));
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    setRadarSignals((prev) => {
      const updated = prev
        .filter((s) => s.detected_at >= ninetyDaysAgo) // limpia viejas
        .map((s) => {
          // Si el horizonte de 30d ya cerró, no tocamos más esa señal
          if (s.outcomes?.closed_30d) return s;
          // Si tenemos precio actual del token, actualizamos su outcome
          const px = currentPriceMap.get(s.symbol);
          if (px === undefined) return s;
          return { ...s, outcomes: updateOutcome(s, px) };
        });
      return [...newRadarSignals, ...updated];
    });

    log(`🎯 Radar: ${newRadarSignals.length} señales registradas en este escaneo.`, "hit");

    const ts = new Date().toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // ─── Narrativa IA (top 5 del Radar + resumen global) ──────────────────────
    // Esto corre al final, después de tener señales y candidatos. Nunca rompe
    // el escaneo: si falla, la narrativa simplemente no se actualiza.
    try {
      const latestTs = newRadarSignals.length
        ? Math.max(...newRadarSignals.map((s) => s.detected_at))
        : Date.now();

      const topForNarrative = selectTopForNarrative(newRadarSignals, latestTs, 5);

      // Narrativa individual con cache por fingerprint
      const updatedNarratives: NarrativeEntry[] = [...narratives];

      for (const sig of topForNarrative) {
        const fp = indicatorsFingerprint(sig.indicators, sig.technical_score);
        const prev = findNarrative(narratives, sig.symbol);

        if (shouldReuseNarrative(prev, fp)) {
          log(`🧭 ${sig.symbol}: narrativa reusada (cache)`, "info");
          continue; // mantenemos la que ya está en updatedNarratives
        }

        const text = await narrateToken({
          symbol: sig.symbol,
          technical_score: sig.technical_score,
          rvol: sig.indicators.rvol,
          bb_squeeze: sig.indicators.bb_squeeze,
          rsi: sig.indicators.rsi,
          rsi_bullish_divergence: sig.indicators.rsi_bullish_divergence,
          range_position_90d: sig.indicators.range_position_90d,
          ath_distance_pct: sig.indicators.ath_distance_pct,
          funding_rate: sig.indicators.funding_rate,
          oi_change_24h: sig.indicators.oi_change_24h,
          has_futures: sig.indicators.has_futures,
          reasons: sig.reasons,
          claude_signal: sig.claude_signal,
        });

        if (text) {
          const entry: NarrativeEntry = {
            symbol: sig.symbol,
            text,
            generated_at: Date.now(),
            indicators_fingerprint: fp,
            technical_score: sig.technical_score,
          };
          // Reemplazamos la previa de ese símbolo, o agregamos
          const idx = updatedNarratives.findIndex((n) => n.symbol === sig.symbol);
          if (idx >= 0) updatedNarratives[idx] = entry;
          else updatedNarratives.push(entry);
          log(`🧭 ${sig.symbol}: narrativa generada`, "hit");
        }
      }

      // Limpiamos narrativas de tokens que ya no están en el top (no inflar storage)
      const topSymbols = new Set(topForNarrative.map((s) => s.symbol));
      const prunedNarratives = updatedNarratives.filter((n) => topSymbols.has(n.symbol));
      setNarratives(prunedNarratives);

      // Resumen global (1 sola llamada)
      const globalText = await narrateGlobal({
        fng: currentFng?.value ?? null,
        fng_label: currentFng?.classification ?? null,
        scanned: pool.length,
        candidates: found.length,
        top: topForNarrative.slice(0, 4).map((s) => ({
          symbol: s.symbol,
          score: s.technical_score,
          reasons: s.reasons.slice(0, 3),
          claude_signal: s.claude_signal,
        })),
      });

      if (globalText) {
        setGlobalNarrative({
          text: globalText,
          generated_at: Date.now(),
          scan_token_count: pool.length,
          candidate_count: found.length,
        });
        log(`🧭 Resumen global generado`, "hit");
      }
    } catch (narrErr) {
      // La narrativa es decorativa — nunca tumba el escaneo
      log(
        `⚠ Narrativa falló (no crítico): ${narrErr instanceof Error ? narrErr.message : "?"}`,
        "warn",
      );
    }

    setLastScan(ts);
    log(
      `🏁 Escaneo completo. ${found.length} candidatos encontrados de ${pool.length} analizados.`,
      "done",
    );
    // Watchlist: snapshots + alertas
    if (watchlist.length > 0) {
      const newSnapshots: WatchlistSnapshot[] = [];
      const newAlerts: WatchlistAlert[] = [];
      const snapshotTs = Date.now();

      for (const w of watchlist) {
        const tok = pool.find((p) => p.symbol === w.symbol);
        if (!tok) continue;
        // Buscamos si Claude lo analizó en este escaneo
        const claudeRes = found.find((f) => f.symbol === w.symbol);
        const radarSig = newRadarSignals.find((r) => r.symbol === w.symbol);

        const newSnap: WatchlistSnapshot = {
          symbol: w.symbol,
          ts: snapshotTs,
          price: tok.price,
          vol24h: tok.vol24h,
          change_24h: tok.change_24h,
          technical_score: radarSig?.technical_score ?? null,
          claude_signal: claudeRes?.signal ?? null,
          claude_score: claudeRes?.score ?? null,
          reason: claudeRes?.reason ?? null,
        };

        const prevSnap = latestSnapshotOf(watchHistory, w.symbol);
        newSnapshots.push(newSnap);
        newAlerts.push(...deriveAlerts(w, newSnap, prevSnap));
      }

      if (newSnapshots.length > 0) {
        setWatchHistory((prev) => {
          let updated = prev;
          for (const s of newSnapshots) updated = appendSnapshot(updated, s);
          return updated;
        });
      }
      if (newAlerts.length > 0) {
        setWatchAlerts((prev) => [...newAlerts, ...prev].slice(0, 100));
        log(`⚡ ${newAlerts.length} alertas de watchlist disparadas`, "hit");
      }
    }
    setHistory((p) => [
      {
        date: new Date().toLocaleString("es"),
        total: pool.length,
        candidates: found.length,
        top: found.length ? Math.max(...found.map((f) => f.score)) : 0,
      },
      ...p.slice(0, 9),
    ]);
    setScanning(false);
    scanning$.current = false;
  }, [
    topN,
    candidates,
    log,
    markApi,
    useStreaming,
    setAlerts,
    setCandidates,
    setHistory,
    setRadarSignals,
    setFng,           
    watchlist, 
    watchHistory, 
    setWatchHistory, 
    setWatchAlerts,
    narratives, 
    setNarratives, 
    setGlobalNarrative,
    stablecoinFilterEnabled,
  ]);

  // ─── Update (refresh de candidatos existentes) ──────────────────────────
  const runUpdate = useCallback(async () => {
    if (!candidates.length) {
      log("No hay candidatos. Ejecuta Descubrir primero.", "warn");
      return;
    }
    log("Actualizando precios desde Binance...", "info");
    try {
      const tickers = await getBinanceTickers();
      markApi("binance", true);
      const priceMap = Object.fromEntries(tickers.map((t) => [t.symbol, t.price]));
      const volMap = Object.fromEntries(tickers.map((t) => [t.symbol, t.vol24h_usd]));

      const updated: CandidateToken[] = await Promise.all(
        candidates.map(async (tok) => {
          const newPrice = priceMap[tok.symbol] ?? tok.price;
          const newVol = volMap[tok.symbol] ?? tok.vol24h;
          let r = null;
          try {
            r = await analyze({ ...tok, price: newPrice, vol24h: newVol });
            markApi("anthropic", true);
          } catch {
            markApi("anthropic", false);
            return tok;
          }
          if (!r) return tok;
          return {
            ...tok,
            ...r,
            price: newPrice,
            vol24h: newVol,
            previous_signal: tok.signal,
            previous_score: tok.score,
            previous_price: tok.price,
            last_updated_at: Date.now(),
          };
        }),
      );

      const active = updated.filter((t) => t.signal !== "EVITAR");

      setCandidates(active);
      log(`✅ Actualización lista. ${active.length} candidatos activos.`, "done");
    } catch (err) {
      markApi("binance", false);
      const msg = err instanceof Error ? err.message : "Error";
      log(`❌ Error: ${msg}`, "warn");
    }
  }, [candidates, log, markApi, setCandidates]);

  // ─── Auto-scan ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScan) {
      setNextScanIn(300);
      autoScanRef.current = setInterval(() => {
        runUpdate();
        setNextScanIn(300);
      }, 5 * 60 * 1000);

      const countdown = setInterval(() => {
        setNextScanIn((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);

      return () => {
        if (autoScanRef.current) clearInterval(autoScanRef.current);
        clearInterval(countdown);
      };
    }
    setNextScanIn(null);
    if (autoScanRef.current) clearInterval(autoScanRef.current);
  }, [autoScan, runUpdate]);

  // ─── Derivados ──────────────────────────────────────────────────────────
  const tgConfigured = !!(tgToken && tgChat);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "Georgia, serif", background: BG, minHeight: "100vh", color: TEXT }}>
      {/* Header */}
      <div
        style={{
          background: CARD,
          borderBottom: `1px solid ${BORDER}`,
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 20,
          flexWrap: "wrap",
          gap: 10,
          width: "100%",
        }}
      >
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 800, color: ACCENT }}>
            Criminal Pump <span style={{ color: TEXT }}>Detector</span>
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
            {lastScan ? `Último escaneo: ${lastScan}` : "Sin escaneos aún"} · Binance · CoinMarketCap ·{" "}
            {autoScan && nextScanIn !== null ? (
              <span style={{ color: GREEN, fontWeight: 600 }}>
                ● Auto-scan activo — próximo en {Math.floor(nextScanIn / 60)}:
                {String(nextScanIn % 60).padStart(2, "0")}
              </span>
            ) : (
              "Claude (server-side)"
            )}
          </div>
        </div>
        <div 
          className="header-actions"
          style={{ 
            display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" 
          }}
        >
          {(
            [
              [candidates.length, "candidatos", ACCENT],
              [alerts.length, "alertas", ORANGE],
            ] as const
          ).map(([val, label, col], i) => (
            <div key={label} style={{ display: "flex", gap: 14, alignItems: "center" }}>
              {i > 0 && <div style={{ width: 1, height: 28, background: BORDER }} />}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: col, fontFamily: "'Inter', sans-serif", lineHeight: 1 }}>
                  {val}
                </div>
                <div style={{ fontSize: 9, color: MUTED, fontFamily: "'Inter', sans-serif" }}>{label}</div>
              </div>
            </div>
          ))}
          <div style={{ width: 1, height: 28, background: BORDER }} />
          <NotificationBell
            alerts={alerts}
            watchAlerts={watchAlerts}
            tgSentLog={tgSentLog}
            lastReadTs={lastEventsReadTs}
            onMarkAllRead={() => setLastEventsReadTs(Date.now())}
            onClearAll={() => {
              setAlerts(() => []);
              setWatchAlerts([]);
            }}
          />
          <ThemeToggle />
        </div>
      </div>

      {apiError && (
        <div
          style={{
            background: "#fdf2f0",
            borderBottom: `1px solid #f0c8c0`,
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: ACCENT, fontFamily: "'Inter', sans-serif" }}>⚠ {apiError}</span>
        </div>
      )}

      {/* Métricas globales del mercado (CoinMarketCap) */}
      <GlobalMetricsBar />

      {/* Tabs */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, width: "100%" }}>
        <TabsBar
          activeTab={tab}
          setTab={setTab}
          alertsCount={alerts.length}
        />
      </div>

      <div className="page-inner">
        {tab === "dashboard" && (
          <DashboardTab
            cardStyle={cardStyle}
            topN={topN}
            setTopN={setTopN}
            scanning={scanning}
            progress={progress}
            candidates={candidates}
            scanLog={scanLog}
            expandedId={expandedId}
            toggleExpand={toggleExpand}
            runDiscover={runDiscover}
            runUpdate={runUpdate}
            autoScan={autoScan}
            setAutoScan={setAutoScan}
            apiStatus={apiStatus}
            tgSentLog={tgSentLog}
            tgConfigured={tgConfigured}
            setTab={(t) => setTab(t as Tab)}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}

            // Datos nuevos para los paneles
            watchlist={watchlist}
            watchHistory={watchHistory}
            addToWatchlist={addToWatchlist}
            removeFromWatchlist={removeFromWatchlist}
            updateWatchlistEntry={updateWatchlistEntry}
            radarSignals={radarSignals}
            fng={fng}
            setRadarSignals={setRadarSignals}
            globalNarrative={globalNarrative}
            klineMap={klineMap}
            narratives={narratives}

            // Estado de expansión
            rowFocus={rowFocus}
            setFocusForRow={setFocusForRow}

          />
        )}

        {tab === "alertas" && <AlertsTab alerts={alerts} setAlerts={setAlerts} />}

        {tab === "learning" && (
          <LearningTab
            history={history}
            alerts={alerts}
            candidates={candidates}
            autoTrade={autoTrade}
          />
        )}

        {tab === "ajustes" && (
          <SettingsTab
            capital={capital}
            setCapital={setCapital}
            autoTrade={autoTrade}
            setAutoTrade={setAutoTrade}
            topN={topN}
            setTopN={setTopN}
            tgToken={tgToken}
            setTgToken={setTgToken}
            tgChat={tgChat}
            setTgChat={setTgChat}
            setTgSentLog={setTgSentLog}
            useStreaming={useStreaming}
            setUseStreaming={setUseStreaming}
            stablecoinFilterEnabled={stablecoinFilterEnabled}
            setStablecoinFilterEnabled={setStablecoinFilterEnabled}
          />
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ════════════════════════════════════════════════════════════════════════════

interface DashboardProps {
  cardStyle: React.CSSProperties;
  topN: number;
  setTopN: (n: number) => void;
  scanning: boolean;
  progress: number;
  candidates: CandidateToken[];
  scanLog: ScanLogEntry[];
  expandedId: string | null;
  toggleExpand: (id: string) => void;
  runDiscover: () => void;
  runUpdate: () => void;
  autoScan: boolean;
  setAutoScan: (fn: (v: boolean) => boolean) => void;
  apiStatus: ApiStatus;
  tgSentLog: TelegramSent[];
  tgConfigured: boolean;
  setTab: (t: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;

  // Datos para los nuevos paneles
  watchlist: WatchlistEntry[];
  watchHistory: WatchlistSnapshot[];
  addToWatchlist: (s: SymbolEntry, currentPrice: number | undefined) => void;
  removeFromWatchlist: (symbol: string) => void;
  updateWatchlistEntry: (symbol: string, updates: Partial<WatchlistEntry>) => void;
  radarSignals: RadarSignal[];
  fng: FearGreedIndex | null;
  setRadarSignals: React.Dispatch<React.SetStateAction<RadarSignal[]>>;
  globalNarrative: GlobalNarrative | null;
  klineMap: Record<string, { opens: number[]; highs: number[]; lows: number[]; closes: number[]; volumes: number[] } | null>;
  narratives: NarrativeEntry[];

  // Estado de expansión
  rowFocus: Record<number, string | null>;
  setFocusForRow: (rowNumber: number, panelId: string | null) => void;
}

function DashboardTab(p: DashboardProps) {
  // BORRAR esta línea: const [searchQuery, setSearchQuery] = useState("")

  // Estos dos useMemo SE MANTIENEN igual, pero ahora referencian p.searchQuery:
  const sortedAll = useMemo(
    () => [...p.candidates].sort((a, b) => b.score - a.score),
    [p.candidates],
  );

  const filtered = useMemo(() => {
    const q = p.searchQuery.trim().toUpperCase();   // ← antes: searchQuery
    if (!q) return sortedAll;
    return sortedAll.filter((t) => {
      const sym = t.symbol.toUpperCase();
      const name = (t.name || "").toUpperCase();
      return sym.includes(q) || name.includes(q);
    });
  }, [sortedAll, p.searchQuery]);                    // ← antes: searchQuery

  const searchDisabled = p.scanning || p.candidates.length === 0;

  return (
    <div>
      <NarrativeBanner narrative={p.globalNarrative} scanning={p.scanning} />

      <div
        style={{
          ...p.cardStyle,
          marginBottom: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, fontWeight: 700 }}>
            Panel de control
          </div>
          <div style={{ fontSize: 12, color: SUB, marginTop: 2, fontFamily: "'Inter', sans-serif" }}>
            Datos en tiempo real — Binance Spot · Top {p.topN} por volumen
          </div>
        </div>

        {/* Layout C: tres grupos con divisores */}
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {/* Grupo 1: configuración */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: SUB, fontFamily: "'Inter', sans-serif" }}>
            <select
              value={p.topN}
              onChange={(e) => p.setTopN(Number(e.target.value))}
              disabled={p.scanning}
              style={{
                background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 6,
                padding: "6px 10px", fontFamily: "'Inter', sans-serif",
                fontSize: 11, color: TEXT, outline: "none", cursor: "pointer",
              }}
            >
              {[3, 5, 10, 20, 30, 40, 50, 75, 100].map((n) => (
                <option key={n} value={n}>Top {n}</option>
              ))}
            </select>
            <span>tokens</span>
          </div>

          <div style={{ width: 1, height: 28, background: BORDER }} />

          {/* Grupo 2: acción de escaneo */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn-p" onClick={p.runDiscover} disabled={p.scanning}>
              {p.scanning ? `Escaneando ${p.progress}%…` : "▶ Escanear ahora"}
            </button>
            <button
              className="btn-s"
              onClick={() => p.setAutoScan((v) => !v)}
              disabled={p.scanning && !p.autoScan}
              style={{
                borderColor: p.autoScan ? GREEN : undefined,
                color: p.autoScan ? GREEN : undefined,
              }}
            >
              {p.autoScan ? "⏹ Detener auto" : "⟳ Auto cada 5 min"}
            </button>
          </div>

          <div style={{ width: 1, height: 28, background: BORDER }} />

          {/* Grupo 3: status */}
          <ApiStatusInline apiStatus={p.apiStatus} />
        </div>
      </div>

      {p.scanning && (
        <div style={{ ...p.cardStyle, marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: SUB,
              fontFamily: "'Inter', sans-serif",
              marginBottom: 8,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: ACCENT,
                  display: "inline-block",
                  animation: "pulse 1s infinite",
                }}
              />
              Analizando vía /api/analyze...
            </span>
            <span style={{ fontWeight: 600, color: ACCENT }}>{p.progress}%</span>
          </div>
          <div style={{ background: BORDER, borderRadius: 99, height: 6, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                background: `linear-gradient(90deg,${ACCENT},${ORANGE})`,
                width: `${p.progress}%`,
                borderRadius: 99,
                transition: "width .3s",
              }}
            />
          </div>
        </div>
      )}

      <div className="dash-grid">
        {/* ─── FILA 1: Discover + Watchlist ────────────────────────────────── */}
        <DashRow
          rowNumber={1}
          focus={p.rowFocus[1] ?? null}
          setFocus={(id) =>
            p.setFocusForRow(1, p.rowFocus[1] === id ? null : id)
          }
          panels={[
            {
              id: "discover",
              render: (compact) => (
                <DiscoverPanel
                  cardStyle={p.cardStyle}
                  scanLog={p.scanLog}
                  candidates={p.candidates}
                  scanning={p.scanning}
                  expandedId={p.expandedId}
                  toggleExpand={p.toggleExpand}
                  searchQuery={p.searchQuery}
                  setSearchQuery={p.setSearchQuery}
                  sortedAll={sortedAll}
                  filtered={filtered}
                  searchDisabled={searchDisabled}
                  isFocused={p.rowFocus[1] === "discover"}
                  onToggleFocus={() =>
                    p.setFocusForRow(
                      1,
                      p.rowFocus[1] === "discover" ? null : "discover",
                    )
                  }
                  compact={compact}
                />
              ),
            },
            {
              id: "watchlist",
              render: (compact) => (
                <WatchlistPanel
                  entries={p.watchlist}
                  history={p.watchHistory}
                  candidates={p.candidates}
                  onAdd={p.addToWatchlist}
                  onRemove={p.removeFromWatchlist}
                  onUpdate={p.updateWatchlistEntry}
                  isFocused={p.rowFocus[1] === "watchlist"}
                  onToggleFocus={() =>
                    p.setFocusForRow(
                      1,
                      p.rowFocus[1] === "watchlist" ? null : "watchlist",
                    )
                  }
                  compact={compact}
                />
              ),
            },
          ]}
        />

        {/* ─── FILA 2: Radar + Telegram ────────────────────────────────────── */}
        <DashRow
          rowNumber={2}
          focus={p.rowFocus[2] ?? null}
          setFocus={(id) =>
            p.setFocusForRow(2, p.rowFocus[2] === id ? null : id)
          }
          panels={[
            {
              id: "radar",
              render: (compact) => (
                <RadarPanel
                  signals={p.radarSignals}
                  fng={p.fng}
                  narratives={p.narratives}
                  isFocused={p.rowFocus[2] === "radar"}
                  onToggleFocus={() =>
                    p.setFocusForRow(
                      2,
                      p.rowFocus[2] === "radar" ? null : "radar",
                    )
                  }
                  compact={compact}
                />
              ),
            },
            {
              id: "telegram",
              render: (compact) => (
                <TelegramPanel
                  tgSentLog={p.tgSentLog}
                  tgConfigured={p.tgConfigured}
                  setTab={p.setTab}
                  isFocused={p.rowFocus[2] === "telegram"}
                  onToggleFocus={() =>
                    p.setFocusForRow(
                      2,
                      p.rowFocus[2] === "telegram" ? null : "telegram",
                    )
                  }
                  compact={compact}
                />
              ),
            },
          ]}
        />
        {/* ─── FILA 3: Wyckoff ─────────── */}
        <DashRow
          rowNumber={3}
          focus={p.rowFocus[3] ?? null}
          setFocus={(id) => p.setFocusForRow(3, p.rowFocus[3] === id ? null : id)}
          panels={[
            {
              id: "wyckoff",
              render: (compact) => (
                <WyckoffPanel
                  signals={p.radarSignals}
                  klineMap={p.klineMap}
                  isFocused={p.rowFocus[3] === "wyckoff"}
                  onToggleFocus={() =>
                    p.setFocusForRow(3, p.rowFocus[3] === "wyckoff" ? null : "wyckoff")
                  }
                  compact={compact}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ALERTS TAB
// ════════════════════════════════════════════════════════════════════════════

function AlertsTab({
  alerts,
  setAlerts,
}: {
  alerts: Alert[];
  setAlerts: (fn: (p: Alert[]) => Alert[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700 }}>
          🔔 Alertas
        </div>
        {alerts.length > 0 && (
          <button className="btn-ghost" onClick={() => setAlerts(() => [])}>
            Limpiar todo
          </button>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 10,
        }}
      >
        {(
          [
            ["Total", alerts.length, ACCENT, "🔔"],
            ["ACUMULAR", alerts.filter((a) => a.signal === "ACUMULAR").length, GREEN, "🟢"],
            ["OBSERVAR", alerts.filter((a) => a.signal === "OBSERVAR").length, ORANGE, "🟡"],
            [
              "Score máx.",
              alerts.length ? Math.max(...alerts.map((a) => a.score)) : "—",
              "#c9a227",
              "🏆",
            ],
          ] as const
        ).map(([label, val, col, icon]) => (
          <div key={label} style={{ ...cardStyle, textAlign: "center", padding: 12 }}>
            <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: col,
                fontFamily: "'Inter', sans-serif",
                lineHeight: 1,
              }}
            >
              {val}
            </div>
            <div style={{ fontSize: 9, color: MUTED, fontFamily: "'Inter', sans-serif", marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      <div style={cardStyle}>
        <div
          style={{
            fontSize: 11,
            color: ACCENT,
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            marginBottom: 10,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Historial de alertas
        </div>
        {alerts.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔔</div>
            <p style={{ color: MUTED, fontSize: 12, fontFamily: "'Inter', sans-serif" }}>
              Sin alertas. Ejecuta descubrir para generarlas.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alerts.map((a) => (
              <div
                key={a.id}
                className="alert-row fa"
                style={{ borderLeftColor: SIG_COLOR[a.signal] || MUTED }}
              >
                <div style={{ fontSize: 9, color: MUTED, fontFamily: "'Inter', sans-serif", minWidth: 34 }}>
                  {a.time}
                </div>
                <div
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 13,
                    fontWeight: 700,
                    minWidth: 52,
                  }}
                >
                  {a.symbol}
                </div>
                <span
                  style={{
                    background: (SIG_COLOR[a.signal] || MUTED) + "18",
                    color: SIG_COLOR[a.signal] || MUTED,
                    border: `1px solid ${SIG_COLOR[a.signal] || MUTED}44`,
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontSize: 8,
                    fontWeight: 700,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {a.signal}
                </span>
                <span
                  style={{
                    background: "#00000008",
                    color: SUB,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4,
                    padding: "1px 6px",
                    fontSize: 8,
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  Score {a.score}
                </span>
                {a.risk && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: RISK_DOT[a.risk] || MUTED,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  style={{
                    fontSize: 11,
                    color: SUB,
                    fontFamily: "'Inter', sans-serif",
                    flex: 1,
                    minWidth: 80,
                  }}
                >
                  {a.reason}
                </span>
                <span style={{ fontSize: 9, color: MUTED, fontFamily: "'Inter', sans-serif" }}>
                  Binance
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LEARNING TAB
// ════════════════════════════════════════════════════════════════════════════

function LearningTab({
  history,
  alerts,
  candidates,
  autoTrade,
}: {
  history: ScanHistoryEntry[];
  alerts: Alert[];
  candidates: CandidateToken[];
  autoTrade: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 2,
        }}
      >
        🧠 Aprendizaje
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
          gap: 10,
        }}
      >
        {(
          [
            ["Escaneos", history.length, "🔍"],
            ["Alertas", alerts.length, "🔔"],
            ["Candidatos", candidates.length, "⚡"],
            ["Auto-trade", autoTrade ? "ON" : "OFF", "🤖"],
          ] as const
        ).map(([label, val, icon]) => (
          <div key={label} style={{ ...cardStyle, textAlign: "center", padding: 14 }}>
            <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: ACCENT,
                fontFamily: "'Playfair Display', serif",
              }}
            >
              {val}
            </div>
            <div style={{ fontSize: 10, color: MUTED, fontFamily: "'Inter', sans-serif" }}>{label}</div>
          </div>
        ))}
      </div>
      <div style={cardStyle}>
        <div
          style={{
            fontSize: 11,
            color: ACCENT,
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            marginBottom: 10,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Historial de escaneos
        </div>
        {history.length === 0 ? (
          <p style={{ fontSize: 12, color: MUTED, fontFamily: "'Inter', sans-serif" }}>
            Sin historial. Ejecuta al menos un escaneo.
          </p>
        ) : (
          history.map((h, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                padding: "7px 0",
                borderBottom: `1px solid ${BORDER}`,
                fontFamily: "'Inter', sans-serif",
                fontSize: 11,
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: MUTED, minWidth: 140 }}>{h.date}</span>
              <span style={{ color: SUB }}>{h.total} analizados</span>
              <span style={{ color: SUB }}>{h.candidates} candidatos</span>
              <span style={{ color: ACCENT, fontWeight: 600 }}>Score máx: {h.top}</span>
            </div>
          ))
        )}
      </div>
      <div style={cardStyle}>
        <div
          style={{
            fontSize: 11,
            color: ACCENT,
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            marginBottom: 10,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Ciclo de aprendizaje
        </div>
        {(
          [
            ["7 días", "Primeros valores de ajuste disponibles"],
            ["30 días", "Afinación real de umbrales y filtros"],
            ["50 señales", "Mínimo para estadística confiable"],
          ] as const
        ).map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              gap: 12,
              padding: "7px 0",
              borderBottom: `1px solid ${BORDER}`,
              fontFamily: "'Inter', sans-serif",
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 11, color: ACCENT, fontWeight: 700, minWidth: 72 }}>{k}</span>
            <span style={{ fontSize: 11, color: SUB }}>{v}</span>
          </div>
        ))}
        <div
          style={{
            marginTop: 12,
            padding: 9,
            background: ORANGE + "12",
            borderRadius: 8,
            fontSize: 10,
            color: ORANGE,
            border: `1px solid ${ORANGE}33`,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          ⚠ Estado: {alerts.length}/50 señales acumuladas para activar aprendizaje
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ════════════════════════════════════════════════════════════════════════════

function SettingsTab(props: {
  capital: number;
  setCapital: (n: number) => void;
  autoTrade: boolean;
  setAutoTrade: (fn: (v: boolean) => boolean) => void;
  topN: number;
  setTopN: (n: number) => void;
  tgToken: string;
  setTgToken: (s: string) => void;
  tgChat: string;
  setTgChat: (s: string) => void;
  setTgSentLog: (fn: (p: TelegramSent[]) => TelegramSent[]) => void;
  useStreaming: boolean;
  setUseStreaming: (fn: (v: boolean) => boolean) => void;
  stablecoinFilterEnabled: boolean;
  setStablecoinFilterEnabled: (fn: (v: boolean) => boolean) => void;
}) {
  const sendTest = async () => {
    const text = `🚨 *Criminal Pump Detector*\n\n*TEST* · Score: \`99\`\n📡 Señal: *ACUMULAR* · Riesgo: HIGH\n💬 Mensaje de prueba\n🕐 ${new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })} · Binance`;
    const ok = await sendTelegram(props.tgToken, props.tgChat, text);
    const entry: TelegramSent = {
      ts: Date.now(),
      time: new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
      symbol: "TEST",
      signal: "ACUMULAR" as Signal,
      ok,
    };
    props.setTgSentLog((p) => [entry, ...p]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 2,
        }}
      >
        ⚙️ Ajustes
      </div>
      <div className="settings-grid">
        <div style={cardStyle}>
          <SettingsTitle>💰 Capital y Auto-trade</SettingsTitle>
          <div style={{ marginBottom: 12 }}>
            <SettingsLabel>Capital total (USD) · Binance</SettingsLabel>
            <input
              type="number"
              value={props.capital}
              onChange={(e) => props.setCapital(+e.target.value)}
              min={10}
            />
          </div>
          <div
            style={{
              marginBottom: 14,
              padding: 10,
              background: BG,
              borderRadius: 8,
              fontSize: 11,
              color: SUB,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            Capital asignado:{" "}
            <strong style={{ color: ACCENT }}>${props.capital.toFixed(2)}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className={`tog ${props.autoTrade ? "on" : ""}`}
              onClick={() => props.setAutoTrade((v) => !v)}
            />
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: props.autoTrade ? GREEN : SUB,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                }}
              >
                Auto-trade {props.autoTrade ? "Activo ✓" : "Inactivo"}
              </div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: "'Inter', sans-serif" }}>
                Opera automático en señal ACUMULAR
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <SettingsTitle>🔍 Descubrir</SettingsTitle>
          <div style={{ marginBottom: 10 }}>
            <SettingsLabel>Tokens a analizar (top por volumen)</SettingsLabel>
            <select
              value={props.topN}
              onChange={(e) => props.setTopN(Number(e.target.value))}
              style={{
                background: BG,
                border: `1.5px solid ${BORDER}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                color: TEXT,
                outline: "none",
                width: "100%",
              }}
            >
              {[20, 30, 40, 50, 75, 100].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              padding: 10,
              background: BG,
              borderRadius: 8,
              fontSize: 10,
              color: SUB,
              fontFamily: "'Inter', sans-serif",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: ACCENT }}>Fuentes:</strong> Binance API + CoinMarketCap (fallback CoinGecko)
            <br />
            <strong style={{ color: ACCENT }}>Enlaces:</strong> CoinMarketCap + TradingView
            <br />
            <strong style={{ color: ACCENT }}>Filtro:</strong> Pares USDT · Vol &gt; $500k
            <br />
            <strong style={{ color: ACCENT }}>Modelo IA:</strong> server-side (env ANTHROPIC_MODEL)
            <br />
            <strong style={{ color: ACCENT }}>Historial:</strong> 30 velas diarias por token
          </div>
        </div>

        <div style={cardStyle}>
          <ApiKeyOverrideCard />
        </div>

        <div style={cardStyle}>
          <SettingsTitle>⚡ Streaming de análisis</SettingsTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <button
              className={`tog ${props.useStreaming ? "on" : ""}`}
              onClick={() => props.setUseStreaming((v) => !v)}
            />
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: props.useStreaming ? GREEN : SUB,
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                }}
              >
                {props.useStreaming ? "Streaming activo (SSE)" : "Modo request/response"}
              </div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: "'Inter', sans-serif" }}>
                Usa Server-Sent Events para empezar a recibir tokens del modelo en cuanto Claude
                arranca a generar
              </div>
            </div>
          </div>
          <div
            style={{
              padding: 10,
              background: BG,
              borderRadius: 8,
              fontSize: 10,
              color: SUB,
              fontFamily: "'Inter', sans-serif",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: ACCENT }}>Cuándo conviene:</strong> conexiones lentas o cuando
            querés feedback temprano de que el modelo está respondiendo.
            <br />
            <strong style={{ color: ACCENT }}>Cuándo no:</strong> en Vercel Hobby (timeout de 10s
            por function). Si vas a hacer scan largo, dejá el toggle apagado o pasá a Pro con{" "}
            <code>export const maxDuration = 60</code> en <code>analyze/route.ts</code>.
          </div>
        </div>

        <div style={cardStyle}>
          <SettingsTitle>🪙 Filtro de Stablecoins</SettingsTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <button
              className={`tog ${props.stablecoinFilterEnabled ? "on" : ""}`}
              onClick={() => props.setStablecoinFilterEnabled((v) => !v)}
            />
            <div>
              <div style={{
                fontSize: 12,
                color: props.stablecoinFilterEnabled ? GREEN : SUB,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
              }}>
                {props.stablecoinFilterEnabled ? "Filtro activo" : "Filtro desactivado"}
              </div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: "'Inter', sans-serif" }}>
                Excluye stablecoins conocidas + detección por volatilidad &lt;2.5%
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <SettingsTitle>📱 Telegram</SettingsTitle>
          <div style={{ marginBottom: 10 }}>
            <SettingsLabel>Bot Token</SettingsLabel>
            <input
              type="password"
              placeholder="1234567890:ABCdef..."
              value={props.tgToken}
              onChange={(e) => props.setTgToken(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <SettingsLabel>Chat ID</SettingsLabel>
            <input
              type="text"
              placeholder="-100123456789"
              value={props.tgChat}
              onChange={(e) => props.setTgChat(e.target.value)}
            />
          </div>
          {props.tgToken && props.tgChat && (
            <div
              style={{
                marginBottom: 10,
                padding: "7px 10px",
                background: GREEN + "12",
                border: `1px solid ${GREEN}33`,
                borderRadius: 7,
                fontSize: 10,
                color: GREEN,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              ✅ Bot configurado
            </div>
          )}
          <button
            className="btn-s"
            style={{ width: "100%" }}
            disabled={!props.tgToken || !props.tgChat}
            onClick={sendTest}
          >
            📤 Enviar mensaje de prueba
          </button>
        </div>

        <div style={cardStyle}>
          <SettingsTitle>🕐 Frecuencia recomendada</SettingsTitle>
          {(
            [
              ["Descubrir", "1× por día (mañana)"],
              ["Monitor", "Cada 30 min"],
              ["Aprendizaje", "Cada 7 días"],
              ["Limpieza", "Cada 24h"],
            ] as const
          ).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: `1px solid ${BORDER}`,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <span style={{ fontSize: 11, color: SUB }}>{k}</span>
              <span style={{ fontSize: 11, color: ACCENT, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <SettingsTitle>💾 Datos guardados (localStorage)</SettingsTitle>
          <div
            style={{
              padding: 10,
              background: BG,
              borderRadius: 8,
              fontSize: 10,
              color: SUB,
              fontFamily: "'Inter', sans-serif",
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            Estos datos sobreviven al refrescar la página:
            <ul style={{ margin: "6px 0 0 14px", padding: 0 }}>
              <li>Candidatos, alertas, historial</li>
              <li>Log de Telegram + bot token + chat ID</li>
              <li>Capital, auto-trade, top N, modo streaming</li>
              <li>Señales del Radar + Fear & Greed cacheado</li>  {/* ← NUEVO */}
            </ul>
          </div>
          <button
            className="btn-s"
            style={{ width: "100%" }}
            onClick={() => {
              if (!confirm("¿Borrar todos los datos guardados? Esta acción no se puede deshacer.")) return;
              try {
                ["cpd_candidates","cpd_alerts","cpd_history",
                  "cpd_tg_log","cpd_tg_token","cpd_tg_chat","cpd_capital",
                  "cpd_autotrade","cpd_topn","cpd_streaming",
                  "cpd_radar_signals", "cpd_fng", // ← NUEVO
                  "cpd_watchlist", "cpd_watch_history", "cpd_watch_alerts", "cpd_last_events_read",
                  "cpd_narratives", "cpd_global_narrative"]
                  .forEach((k) => window.localStorage.removeItem(k));
                window.location.reload();
              } catch (e) {
                alert("No pude limpiar: " + (e instanceof Error ? e.message : "error"));
              }
            }}
          >
            🗑 Borrar todos los datos guardados
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: ACCENT,
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        marginBottom: 12,
        letterSpacing: 1,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function SettingsLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: 11,
        color: SUB,
        fontFamily: "'Inter', sans-serif",
        display: "block",
        marginBottom: 4,
      }}
    >
      {children}
    </label>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TABS BAR (con flechas para mobile)
// ════════════════════════════════════════════════════════════════════════════

function TabsBar({
  activeTab,
  setTab,
  alertsCount,
}: {
  activeTab: Tab;
  setTab: (t: Tab) => void;
  alertsCount: number;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  // Recalcula si las flechas deben estar visibles según el scroll actual
  const updateArrows = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows);
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.7;
    el.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <div className="tab-bar-wrapper">
      <button
        className={`tab-arrow ${!canScrollLeft ? "is-hidden" : ""}`}
        onClick={() => scrollBy("left")}
        aria-label="Tabs anteriores"
      >
        ‹
      </button>

      <div ref={scrollRef} className="tab-bar">
        <button
          className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setTab("dashboard")}
        >
          📊 Panel
        </button>
        <button
          className={`tab-btn ${activeTab === "alertas" ? "active" : ""}`}
          onClick={() => setTab("alertas")}
        >
          🔔 Alertas{" "}
          {alertsCount > 0 && (
            <span
              style={{
                background: ORANGE,
                color: "#fff",
                borderRadius: 9,
                padding: "0 5px",
                fontSize: 9,
                marginLeft: 4,
                fontWeight: 700,
              }}
            >
              {alertsCount}
            </span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === "learning" ? "active" : ""}`}
          onClick={() => setTab("learning")}
        >
          🧠 Aprendizaje
        </button>
        <div className="tab-spacer" />
        <button
          className={`tab-btn ${activeTab === "ajustes" ? "active" : ""}`}
          onClick={() => setTab("ajustes")}
        >
          ⚙️ Ajustes
        </button>
      </div>

      <button
        className={`tab-arrow ${!canScrollRight ? "is-hidden" : ""}`}
        onClick={() => scrollBy("right")}
        aria-label="Tabs siguientes"
      >
        ›
      </button>
    </div>
  );
}