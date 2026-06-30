"use client";

import { useMemo, useState, useEffect } from "react";
import { COLORS } from "@/lib/constants";
import type { RadarSignal } from "@/lib/types";
import PanelHeader from "@/components/PanelHeader";

const { CARD, BORDER, BG, TEXT, SUB, MUTED, ACCENT, ORANGE, GREEN } = COLORS;

const SVG_GREEN  = "#22c55e";
const SVG_RED    = "#ef4444";
const SVG_ORANGE = "#f97316";
const SVG_PURPLE = "#a78bfa"
const SVG_MUTED  = "#6b7280";

interface KlineData {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
}

interface Props {
  signals: RadarSignal[];
  klineMap: Record<string, KlineData | null>;
  isFocused: boolean;
  onToggleFocus: () => void;
  compact: boolean;
}

// ─── Helpers Wyckoff ─────────────────────────────────────────────────────────

function detectPhase(
  ind: RadarSignal["indicators"],
  kline: KlineData,
): {
  phase: string;
  scenario: "accumulation" | "distribution" | "unknown";
  label: string;
  color: string;
  confidence: number; // 0-100
  phaseRanges: Record<string, [number, number]>; // fase → [idxStart, idxEnd]
} {
  const { closes, highs, lows } = kline;
  const n = closes.length;
  const { wyckoff_prior_trend, wyckoff_tr_width, wyckoff_spring_utad, wyckoff_effort_vs_result } = ind;

  // ─── Detectar rangos de velas por evento ────────────────────────────────
  const rangeStart = Math.max(0, n - 20);
  const rangeEnd   = n - 1;

  // SC/BC: vela con mínimo/máximo más extremo en la primera mitad del rango
  const firstHalf = Math.floor((rangeStart + rangeEnd) / 2);
  let scIdx = rangeStart;
  let bcIdx = rangeStart;
  for (let i = rangeStart; i <= firstHalf; i++) {
    if (lows[i] < lows[scIdx])  scIdx = i;
    if (highs[i] > highs[bcIdx]) bcIdx = i;
  }

  // AR: vela con mayor rebote justo después del SC/BC (ventana de 3 velas)
  const arIdx = Math.min(scIdx + 3, rangeEnd);
  const arIdxDist = Math.min(bcIdx + 3, rangeEnd);

  // ST: test del clímax — vela más cercana al nivel del SC/BC en segunda mitad
  const secondHalf = firstHalf + 1;
  let stIdx = secondHalf;
  let minDistST = Infinity;
  for (let i = secondHalf; i <= rangeEnd - 3; i++) {
    const dist = Math.abs(closes[i] - closes[scIdx]);
    if (dist < minDistST) { minDistST = dist; stIdx = i; }
  }

  // Spring/UTAD: últimas 3 velas
  const springIdx: [number, number] = [Math.max(0, n - 3), n - 1];

  // SOS/SOW: últimas 5 velas
  const sosIdx: [number, number] = [Math.max(0, n - 5), n - 1];

  const phaseRanges: Record<string, [number, number]> = {
    A: [rangeStart, arIdx],
    B: [arIdx + 1, stIdx],
    C: springIdx,
    D: sosIdx,
    E: [Math.max(0, n - 8), n - 1],
  };

  // ─── Scoring de confianza ────────────────────────────────────────────────
  let confidence = 30; // base especulativa
  let phase = "B";
  let scenario: "accumulation" | "distribution" | "unknown" = "unknown";

  if (wyckoff_spring_utad === "spring") {
    phase = "C"; scenario = "accumulation";
    confidence = 75;
    if (wyckoff_effort_vs_result > 0.3) confidence += 10;
    if (wyckoff_prior_trend === "down")  confidence += 10;
  } else if (wyckoff_spring_utad === "utad") {
    phase = "C"; scenario = "distribution";
    confidence = 75;
    if (wyckoff_prior_trend === "up") confidence += 10;
  } else if (wyckoff_prior_trend === "down" && wyckoff_tr_width < 0.08) {
    scenario = "accumulation";
    if (wyckoff_effort_vs_result > 0.3) {
      phase = "B"; confidence = 60;
    } else {
      phase = "A"; confidence = 45;
    }
    if (ind.rsi < 40) confidence += 10;
    if (ind.bb_squeeze > 0.6) confidence += 10;
  } else if (wyckoff_prior_trend === "up" && wyckoff_tr_width < 0.08) {
    phase = "B"; scenario = "distribution"; confidence = 55;
    if (ind.rsi > 60) confidence += 10;
  } else if (ind.range_position_90d < 0.3 && wyckoff_prior_trend === "down") {
    phase = "D"; scenario = "accumulation"; confidence = 50;
    if (ind.rvol > 1.5) confidence += 15;
  } else if (ind.range_position_90d > 0.7 && wyckoff_prior_trend === "up") {
    phase = "D"; scenario = "distribution"; confidence = 50;
    if (ind.rvol > 1.5) confidence += 15;
  } else if (ind.rsi > 65 && wyckoff_prior_trend === "up") {
    phase = "E"; scenario = "distribution"; confidence = 45;
  } else {
    // Fallback: siempre da una hipótesis
    scenario = wyckoff_prior_trend === "down" ? "accumulation" : "distribution";
    phase = "B";
    confidence = 30;
  }

  confidence = Math.min(100, confidence);

  const color =
    confidence >= 71 ? SVG_GREEN :
    confidence >= 41 ? SVG_ORANGE :
    SVG_MUTED;

  const label =
    scenario === "accumulation"
      ? `Fase ${phase} · Acumulación · ${confidence}% confianza`
      : scenario === "distribution"
      ? `Fase ${phase} · Distribución · ${confidence}% confianza`
      : `Fase ${phase} · ${confidence}% confianza`;

  return { phase, scenario, label, color, confidence, phaseRanges };
}

// ─── Gráfico SVG de precio + volumen ────────────────────────────────────────

function PriceChart({
  kline,
  signal,
  highlightRange,
}: {
  kline: KlineData;
  signal: RadarSignal;
  highlightRange: [number, number] | null;
}) {
  const { opens, highs, lows, closes, volumes } = kline;
  const W = 540;
  const H = 160;
  const VOL_H = 36;
  const PAD = { top: 12, right: 16, bottom: 4, left: 44 };

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom - VOL_H - 8;
  const n = closes.length;

  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const rangeP = maxP - minP || 1;
  const maxV = Math.max(...volumes) || 1;
  const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  const candleW = Math.max(2, (chartW / n) * 0.7);
  const xOf = (i: number) => PAD.left + (i + 0.5) * (chartW / n);
  const yOf = (p: number) => PAD.top + chartH - ((p - minP) / rangeP) * chartH;

  // Trading Range
  const trWidth = signal.indicators.wyckoff_tr_width;
  const inRange = trWidth < 0.12;
  const rangeLow  = closes[n - 1] * (1 - trWidth / 2);
  const rangeHigh = closes[n - 1] * (1 + trWidth / 2);

  // Precio detección
  const detY = yOf(signal.detection_price);

  // Eje Y
  const yTicks = [0, 0.33, 0.66, 1].map((t) => ({
    y: PAD.top + chartH - t * chartH,
    label: fmtShort(minP + t * rangeP),
  }));

  // Volumen
  const volY0 = PAD.top + chartH + 8 + VOL_H;
  const volBarW = Math.max(1, (chartW / n) * 0.7);

  return (
    <svg
      viewBox={`0 0 ${W} ${H + VOL_H + 8}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label={`Gráfico de velas de ${signal.symbol} con análisis Wyckoff`}
    >
      {/* Trading Range highlight */}
      {inRange && (
        <rect
          x={PAD.left} y={yOf(rangeHigh)}
          width={chartW} height={Math.max(2, yOf(rangeLow) - yOf(rangeHigh))}
          fill={SVG_ORANGE + "22"} stroke={SVG_ORANGE + "66"} style={{ pointerEvents: "none" }}
        />
      )}

      {/* Línea precio detección */}
      <line
        x1={PAD.left} y1={detY} x2={PAD.left + chartW} y2={detY}
        stroke={SVG_RED} strokeWidth={1} strokeDasharray="4 3"
      />

      {/* Eje Y */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD.left - 3} y1={t.y} x2={PAD.left + chartW} y2={t.y}
            stroke={"#374151"} strokeWidth={0.5} strokeDasharray="2 3"
          />
          <text x={PAD.left - 5} y={t.y + 3.5}
            textAnchor="end" fontSize={8} fill={SVG_MUTED} fontFamily="monospace">
            {t.label}
          </text>
        </g>
      ))}

      {/* Highlight de fase seleccionada */}
      {highlightRange && (
        <rect
          x={xOf(highlightRange[0]) - candleW}
          y={PAD.top}
          width={xOf(highlightRange[1]) - xOf(highlightRange[0]) + candleW * 2}
          height={chartH}
          fill={SVG_PURPLE + "22"}
          stroke={SVG_PURPLE + "66"}
          strokeWidth={1}
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* Velas japonesas */}
      {closes.map((close, i) => {
        const open  = opens[i];
        const high  = highs[i];
        const low   = lows[i];
        const bull  = close >= open;
        const col   = bull ? SVG_GREEN : SVG_RED;
        const cx    = xOf(i);
        const bodyY = yOf(Math.max(open, close));
        const bodyH = Math.max(1, Math.abs(yOf(open) - yOf(close)));

        return (
          <g key={i}>
            {/* Mecha */}
            <line
              x1={cx} y1={yOf(high)} x2={cx} y2={yOf(low)}
              stroke={col} strokeWidth={0.8}
            />
            {/* Cuerpo */}
            <rect
              x={cx - candleW / 2} y={bodyY}
              width={candleW} height={bodyH}
              fill={bull ? col + "cc" : col}
              stroke={col} strokeWidth={0.5}
            />
          </g>
        );
      })}

      {/* Barras de volumen */}
      {volumes.map((v, i) => {
        const barH = (v / maxV) * VOL_H;
        const bull  = closes[i] >= opens[i];
        return (
          <rect
            key={i}
            x={xOf(i) - volBarW / 2} y={volY0 - barH}
            width={Math.max(1, volBarW)} height={barH}
            fill={v > avgVol * 1.5
              ? SVG_RED
              : bull ? SVG_GREEN : SVG_RED}
          />
        );
      })}

      {/* Labels */}
      <text x={PAD.left + 3} y={detY - 3} fontSize={8} fill={SVG_ORANGE} fontFamily="sans-serif">
        Detección
      </text>
      {inRange && (
        <text x={PAD.left + 3} y={yOf(rangeHigh) + 10} fontSize={8} fill={SVG_ORANGE} fontFamily="sans-serif">
          Trading Range
        </text>
      )}
    </svg>
  );
}

// ─── Indicadores Wyckoff en chips ────────────────────────────────────────────

function WyckoffChips({ signal }: { signal: RadarSignal }) {
  const ind = signal.indicators;
  const chips: { label: string; color: string; bg: string }[] = [];

  // Tendencia previa
  chips.push(
    ind.wyckoff_prior_trend === "down"
      ? { label: "↓ Bajista previo", color: GREEN, bg: GREEN + "14" }
      : ind.wyckoff_prior_trend === "up"
      ? { label: "↑ Alcista previo", color: ACCENT, bg: ACCENT + "14" }
      : { label: "→ Neutro", color: MUTED, bg: MUTED + "14" },
  );

  // Trading Range
  chips.push(
    ind.wyckoff_tr_width < 0.08
      ? { label: `TR ${(ind.wyckoff_tr_width * 100).toFixed(1)}% ✓`, color: GREEN, bg: GREEN + "14" }
      : { label: `TR ${(ind.wyckoff_tr_width * 100).toFixed(1)}%`, color: MUTED, bg: MUTED + "14" },
  );

  // Esfuerzo vs Resultado
  chips.push(
    ind.wyckoff_effort_vs_result > 0.3
      ? { label: `Absorción ${(ind.wyckoff_effort_vs_result * 100).toFixed(0)}%`, color: ORANGE, bg: ORANGE + "14" }
      : { label: `E/R ${(ind.wyckoff_effort_vs_result * 100).toFixed(0)}%`, color: MUTED, bg: MUTED + "14" },
  );

  // Spring / UTAD
  if (ind.wyckoff_spring_utad === "spring") {
    chips.push({ label: "🟢 Spring", color: GREEN, bg: GREEN + "14" });
  } else if (ind.wyckoff_spring_utad === "utad") {
    chips.push({ label: "🔴 UTAD", color: ACCENT, bg: ACCENT + "14" });
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
      {chips.map((c, i) => (
        <span
          key={i}
          style={{
            background: c.bg,
            color: c.color,
            border: `1px solid ${c.color}33`,
            borderRadius: 4,
            padding: "2px 7px",
            fontSize: 10,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
          }}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ─── Mapa de fases (diagrama compacto) ───────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

function PhaseMap({
  currentPhase,
  scenario,
  confidence,
  phaseRanges,
  highlightPhase,
  onHoverPhase,
}: {
  currentPhase: string;
  scenario: "accumulation" | "distribution" | "unknown";
  confidence: number;
  phaseRanges: Record<string, [number, number]>;
  highlightPhase: string | null;
  onHoverPhase: (phase: string | null) => void;
}) {
  const isMobile = useIsMobile();
  const phases = ["A", "B", "C", "D", "E"];
  const acumLabels: Record<string, string> = {
    A: "SC / AR", B: "ST", C: "Spring", D: "SOS / BUEC", E: "Markup",
  };
  const distLabels: Record<string, string> = {
    A: "BC / AR", B: "ST", C: "UTAD", D: "SOW", E: "Markdown",
  };
  const labels = scenario === "distribution" ? distLabels : acumLabels;

  const phaseColor = (p: string) => {
    const isActive = p === currentPhase;
    const isPast   = phases.indexOf(p) < phases.indexOf(currentPhase);
    if (isActive) return confidence >= 71 ? "#84cc16" : confidence >= 41 ? "#ca8a04" : "#e14d4d";
    if (isPast)   return "#757575";
    return "#a1a1a1";
  };

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "stretch", marginBottom: 12 }}>
      {phases.map((p, i) => {
        const isActive  = p === currentPhase;
        const isPast    = phases.indexOf(p) < phases.indexOf(currentPhase);
        const isHovered = p === highlightPhase;
        const col       = phaseColor(p);
        const hasRange  = !!phaseRanges[p];

        return (
          <div key={p} style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <div
              onMouseEnter={() => !isMobile && hasRange && onHoverPhase(p)}
              onMouseLeave={() => !isMobile && onHoverPhase(null)}
              onClick={() => {
                if (!hasRange) return;
                if (isMobile) {
                  onHoverPhase(highlightPhase === p ? null : p);
                }
              }}
              style={{
                flex: 1,
                borderRadius: 5,
                padding: "5px 4px",
                textAlign: "center",
                background: isActive ? col + "22" : isPast ? col + "0a" : "transparent",
                border: `1px solid ${isHovered ? "#adadad" : isActive ? "#d8d9db" : "#d8d9db"}`,
                cursor: hasRange ? "pointer" : "default",
                transition: "all .15s",
              }}
            >
              <div style={{
                fontSize: 9, fontWeight: 700,
                color: col,
                fontFamily: "'Inter', sans-serif", letterSpacing: 0.5,
              }}>
                {p}
              </div>
              <div style={{
                fontSize: 8,
                color: isActive ? col : MUTED,
                fontFamily: "'Inter', sans-serif", marginTop: 1, lineHeight: 1.2,
              }}>
                {labels[p]}
              </div>
            </div>
            {i < phases.length - 1 && (
              <div style={{ width: 8, height: 1, background: isPast ? col + "55" : BORDER, flexShrink: 0 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Selector de token ───────────────────────────────────────────────────────

function TokenSelector({
  signals,
  selected,
  onSelect,
}: {
  signals: RadarSignal[];
  selected: string | null;
  onSelect: (s: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
      {signals.map((s) => {
        const isSelected = s.symbol === selected;
        const col = s.indicators.wyckoff_spring_utad === "spring"
          ? GREEN
          : s.indicators.wyckoff_spring_utad === "utad"
          ? ACCENT
          : s.indicators.wyckoff_prior_trend === "down" && s.indicators.wyckoff_tr_width < 0.08
          ? ORANGE
          : MUTED;

        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.symbol)}
            style={{
              background: isSelected ? col + "20" : BG,
              border: `1px solid ${isSelected ? col : BORDER}`,
              borderRadius: 6,
              padding: "3px 9px",
              fontSize: 11,
              fontWeight: isSelected ? 700 : 400,
              color: isSelected ? col : SUB,
              fontFamily: "'Inter', sans-serif",
              cursor: "pointer",
              transition: "all .15s",
            }}
          >
            {s.symbol}
            <span style={{ fontSize: 9, color: MUTED, marginLeft: 4 }}>
              {s.technical_score}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Panel principal ─────────────────────────────────────────────────────────

export default function WyckoffPanel({
  signals,
  klineMap,
  isFocused,
  onToggleFocus,
  compact,
}: Props) {
  const latestScanTs = useMemo(() => {
    if (!signals.length) return 0;
    return Math.max(...signals.map((s) => s.detected_at));
  }, [signals]);

  const activeSignals = useMemo(() => {
    if (!latestScanTs) return [];
    const cutoff = latestScanTs - 5 * 60 * 1000;
    return signals
      .filter((s) => s.detected_at >= cutoff)
      .sort((a, b) => b.technical_score - a.technical_score);
  }, [signals, latestScanTs]);

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [highlightPhase, setHighlightPhase] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!activeSignals.length) return null;
    if (selectedSymbol) return activeSignals.find((s) => s.symbol === selectedSymbol) ?? activeSignals[0];
    return activeSignals[0];
  }, [activeSignals, selectedSymbol]);

  const klineKey = selected
    ? Object.keys(klineMap).find((k) => k.startsWith(selected.symbol))
    : null;
  const kline = klineKey ? klineMap[klineKey] : null;

  const phaseInfo = selected && kline ? detectPhase(selected.indicators, kline) : null;

  if (!activeSignals.length) {
    return (
      <div
        style={{
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 120,
          gap: 6,
        }}
      >
        <div style={{ fontSize: 24, opacity: 0.4 }}>📐</div>
        <div style={{ fontSize: 11, color: MUTED, fontFamily: "'Inter', sans-serif" }}>
          Sin señales activas — ejecutá Descubrir
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Header */}
      <PanelHeader
        title="📐 Wyckoff"
        subtitle={`${activeSignals.length} tokens · último escaneo`}
        isFocused={isFocused}
        onToggleFocus={onToggleFocus}
      />

      {/* Selector de tokens */}
      <TokenSelector
        signals={activeSignals}
        selected={selected?.symbol ?? null}
        onSelect={setSelectedSymbol}
      />

      {selected && phaseInfo && (
        <>
          {/* Fase detectada */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
          }}>
            <span style={{
              background: phaseInfo.color + "18",
              color: phaseInfo.color,
              border: `1px solid ${phaseInfo.color}44`,
              borderRadius: 5,
              padding: "3px 9px",
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "'Inter', sans-serif",
            }}>
              {phaseInfo.scenario === "accumulation" ? "↑ Acumulación" : phaseInfo.scenario === "distribution" ? "↓ Distribución" : "? Sin definir"}
            </span>
            <span style={{ fontSize: 11, color: SUB, fontFamily: "'Inter', sans-serif" }}>
              {phaseInfo.label}
            </span>
          </div>

          {/* Mapa de fases */}
          <PhaseMap
            currentPhase={phaseInfo.phase}
            scenario={phaseInfo.scenario}
            confidence={phaseInfo.confidence}
            phaseRanges={phaseInfo.phaseRanges}
            highlightPhase={highlightPhase}
            onHoverPhase={setHighlightPhase}
          />

          {/* Chips Wyckoff */}
          <WyckoffChips signal={selected} />

          {/* Gráfico */}
          {kline && kline.closes.length >= 10 && kline.highs && kline.lows ? (
            <div style={{
              background: BG,
              borderRadius: 8,
              padding: "10px 8px 6px 4px",
              border: `1px solid ${BORDER}`,
            }}>
              <div style={{
                fontSize: 9,
                color: MUTED,
                fontFamily: "'Inter', sans-serif",
                marginBottom: 4,
                paddingLeft: 44,
                display: "flex",
                gap: 12,
              }}>
                <span>{selected.symbol} · {kline.closes.length}d diario</span>
                <span style={{ color: ORANGE }}>— Trading Range</span>
                <span style={{ color: ACCENT + "99" }}>-- Precio detección</span>
              </div>
              <PriceChart
                kline={kline}
                signal={selected}
                highlightRange={highlightPhase ? phaseInfo.phaseRanges[highlightPhase] ?? null : null}
              />
            </div>
          ) : (
            <div style={{
              background: BG,
              borderRadius: 8,
              padding: 16,
              textAlign: "center",
              fontSize: 11,
              color: MUTED,
              fontFamily: "'Inter', sans-serif",
              border: `1px solid ${BORDER}`,
            }}>
              Sin datos de precio disponibles para {selected.symbol}
            </div>
          )}

          {/* Nota educativa */}
          {!compact && (
            <div style={{
              marginTop: 10,
              padding: "7px 10px",
              background: phaseInfo.color + "0a",
              borderRadius: 7,
              fontSize: 10,
              color: SUB,
              fontFamily: "'Inter', sans-serif",
              lineHeight: 1.5,
              border: `1px solid ${phaseInfo.color}22`,
            }}>
              {phaseInfo.scenario === "accumulation" && phaseInfo.phase === "C" &&
                "Spring confirmado: ruptura falsa del soporte que se revirtió. Señal de entrada de alta convicción si viene con volumen decreciente en el rebote."}
              {phaseInfo.scenario === "accumulation" && phaseInfo.phase === "B" &&
                "Fase B: los grandes jugadores absorben oferta. Cada test con menos volumen confirma que la venta se agota. Esperar Spring o SOS antes de entrar."}
              {phaseInfo.scenario === "accumulation" && phaseInfo.phase === "A" &&
                "Fase A: fin de la tendencia bajista. El SC y AR definieron el rango. Demasiado pronto para entrar — esperar desarrollo de Fases B y C."}
              {phaseInfo.scenario === "accumulation" && phaseInfo.phase === "D" &&
                "Fase D: SOS confirmado, el precio superó el rango con volumen. BUEC (pullback al techo del rango) es la última oportunidad de entrada."}
              {phaseInfo.scenario === "distribution" && phaseInfo.phase === "C" &&
                "UTAD confirmado: trampa alcista sobre la resistencia. Los que compraron tarde quedan atrapados. Señal de salida o short si viene seguido de SOW."}
              {phaseInfo.scenario === "distribution" && phaseInfo.phase === "B" &&
                "Fase B de distribución: la oferta se va instalando en el rango. Cada rally con menos volumen confirma que la demanda se agota."}
              {phaseInfo.scenario === "distribution" && phaseInfo.phase === "D" &&
                "Fase D: SOW confirmado. El precio rompió el soporte del rango. Markdown en camino — evitar posiciones largas."}
              {phaseInfo.scenario === "unknown" &&
                "No hay suficientes señales para clasificar el escenario. El precio no muestra un rango claro ni tendencia previa definida."}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function fmtShort(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}