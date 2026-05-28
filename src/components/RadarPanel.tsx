"use client";

import { useMemo, useState } from "react";
import { COLORS, SIG_COLOR } from "@/lib/constants";
import { fmtPrice, relTime } from "@/lib/formatters";
import { computePerformance } from "@/lib/radar";
import ExpandButton from "./ExpandButton";
import ScoreBadge from "./ScoreBadge";
import PanelHeader from "@/components/PanelHeader";
import type {
  RadarSignal,
  FearGreedIndex,
  ClaudeAgreement,
  NarrativeEntry,
} from "@/lib/types";

const { CARD, CARD_INNER, BORDER, BG, TEXT, SUB, MUTED, ACCENT, ORANGE, GREEN } = COLORS;

const tint = (c: string, pct: number) =>
  `color-mix(in srgb, ${c} ${pct}%, transparent)`;

interface Props {
  signals: RadarSignal[];
  fng: FearGreedIndex | null;
  isFocused: boolean;
  onToggleFocus: () => void;
  compact: boolean;
  maxRows?: number;
  narratives?: NarrativeEntry[];
}

export default function RadarPanel({
  signals,
  fng,
  isFocused,
  onToggleFocus,
  compact,
  narratives = [],
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const performance = useMemo(() => computePerformance(signals), [signals]);
  const visible = activeSignals;

  const narrativeOf = (symbol: string) =>
    narratives.find((n) => n.symbol === symbol);

  return (
    <div
      className={`dash-panel panel-radar ${compact ? "panel-compact" : ""}`}
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <PanelHeader
        title="🎯 Radar — Señales técnicas"
        subtitle={
          <>
            <span>{activeSignals.length} activas · ordenadas por score</span>
            {fng && (
              <span
                style={{
                  background: `color-mix(in srgb, ${fngColor(fng.value)} 10%, transparent)`,
                  color: fngColor(fng.value),
                  border: `1px solid color-mix(in srgb, ${fngColor(fng.value)} 30%, transparent)`,
                  borderRadius: 4,
                  padding: "1px 5px",
                  fontSize: 8,
                  fontWeight: 700,
                }}
              >
                F&G {fng.value}
              </span>
            )}
          </>
        }
        isFocused={isFocused}
        onToggleFocus={onToggleFocus}
      />

      {activeSignals.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="panel-inner panel-inner--single">
          <div className="panel-tokens-header">
            <PerfLine performance={performance} />
          </div>

          <div className="scroll-y" style={{ gap: 6 }}>
            {visible.map((s) => (
              <RadarCard
                key={s.id}
                signal={s}
                narrative={narrativeOf(s.symbol)}
                expanded={expandedId === s.id}
                onToggle={() => {
                  if (compact) return;
                  setExpandedId((cur) => (cur === s.id ? null : s.id));
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Header del panel ────────────────────────────────────────────────────────

function fngColor(value: number): string {
  if (value < 25) return GREEN;
  if (value < 75) return ORANGE;
  return ACCENT;
}

function PerfLine({
  performance: p,
}: {
  performance: ReturnType<typeof computePerformance>;
}) {
  const hasOutcomes = p.signals_with_7d_outcome > 0;
  if (!hasOutcomes) {
    return (
      <div
        style={{
          padding: "6px 8px",
          background: BG,
          borderRadius: 6,
          fontSize: 9,
          color: MUTED,
          fontFamily: "'Inter', sans-serif",
          marginBottom: 8,
          fontStyle: "italic",
        }}
      >
        {p.total_signals === 0
          ? "Sin señales registradas — ejecutá Descubrir"
          : `${p.total_signals} señales · calentamiento (outcomes aparecen a los 7d)`}
      </div>
    );
  }

  const hitCol =
    p.hit_rate_7d! >= 60 ? GREEN : p.hit_rate_7d! >= 45 ? ORANGE : ACCENT;
  return (
    <div
      style={{
        padding: "6px 10px",
        background: BG,
        borderRadius: 6,
        fontSize: 9,
        color: SUB,
        fontFamily: "'Inter', sans-serif",
        marginBottom: 8,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span>
        7d:{" "}
        <strong style={{ color: hitCol, fontSize: 10 }}>
          {p.hit_rate_7d!.toFixed(0)}%
        </strong>{" "}
        <span style={{ color: MUTED }}>hit</span>
      </span>
      {p.avg_change_7d !== null && (
        <span>
          Avg:{" "}
          <strong
            style={{
              color: p.avg_change_7d >= 0 ? GREEN : ACCENT,
              fontSize: 10,
            }}
          >
            {p.avg_change_7d >= 0 ? "+" : ""}
            {p.avg_change_7d.toFixed(1)}%
          </strong>
        </span>
      )}
      {p.best_signal && (
        <span>
          🏆 {p.best_signal.symbol}{" "}
          <strong style={{ color: GREEN, fontSize: 10 }}>
            +{p.best_signal.outcomes!.change_7d_pct!.toFixed(1)}%
          </strong>
        </span>
      )}
      <span style={{ color: MUTED, marginLeft: "auto", fontSize: 9 }}>
        {p.signals_with_7d_outcome} cerradas
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        padding: "20px 12px",
        textAlign: "center",
        fontSize: 11,
        color: MUTED,
        fontFamily: "'Inter', sans-serif",
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.5 }}>🎯</div>
      Sin señales activas.
      <br />
      <span style={{ fontSize: 10 }}>Ejecutá Descubrir para generarlas.</span>
    </div>
  );
}

// ─── Card del Radar (header colapsado + sección expandida) ───────────────────

interface CardProps {
  signal: RadarSignal;
  narrative: NarrativeEntry | undefined;
  expanded: boolean;
  onToggle: () => void;
}

function RadarCard({ signal: s, narrative, expanded, onToggle }: CardProps) {
  const col = scoreColor(s.technical_score);
  const agreementMeta = getAgreementMeta(s.agreement);
  const detectedAgo = relTime(s.detected_at);

  return (
    <div
      className="fa"
      style={{
        background: BG,
        borderRadius: 8,
        borderLeft: `3px solid ${col}`,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Header colapsado (mismo estilo que antes pero clickeable) */}
      <div
        onClick={onToggle}
        style={{
          padding: "7px 10px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <ScoreBadge score={s.technical_score} size={32} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexWrap: "wrap",
              marginBottom: 2,
            }}
          >
            <span
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {s.symbol}
            </span>
            <span style={{ fontSize: 9, color: MUTED }}>
              {fmtPrice(s.detection_price)}
            </span>
            {agreementMeta && (
              <span
                title={agreementMeta.tooltip}
                style={{
                  background: tint(agreementMeta.color, 12),
                  color: agreementMeta.color,
                  border: `1px solid ${tint(agreementMeta.color, 30)}`,
                  borderRadius: 4,
                  padding: "1px 5px",
                  fontSize: 8,
                  fontWeight: 700,
                }}
              >
                {agreementMeta.label}
              </span>
            )}
            {narrative && (
              <span
                title="Esta señal tiene análisis narrativo de IA"
                style={{
                  background: tint(ACCENT, 12),
                  color: ACCENT,
                  border: `1px solid ${tint(ACCENT, 30)}`,
                  borderRadius: 4,
                  padding: "1px 5px",
                  fontSize: 8,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                🧭 IA
              </span>
            )}
          </div>
          {s.reasons.length > 0 && (
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {s.reasons.slice(0, 3).map((r, i) => (
                <span
                  key={i}
                  style={{
                    background: tint(ACCENT, 6),
                    color: SUB,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 4,
                    padding: "1px 5px",
                    fontSize: 8,
                  }}
                >
                  {r}
                </span>
              ))}
              {s.reasons.length > 3 && (
                <span style={{ fontSize: 8, color: MUTED, alignSelf: "center" }}>
                  +{s.reasons.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        <span
          style={{
            fontSize: 14,
            color: MUTED,
            transition: "transform .2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-block",
            marginLeft: 4,
          }}
        >
          ▾
        </span>
      </div>

      {/* Contenido expandido — específico del Radar */}
      {expanded && (
        <div
          style={{
            padding: "10px 12px 14px 12px",
            borderTop: `1px solid ${BORDER}`,
            background: CARD_INNER,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {/* Narrativa IA (solo para el top 5) */}
          {narrative && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 10px",
                background: tint(ACCENT, 5),
                borderRadius: 6,
                borderLeft: `2px solid ${tint(ACCENT, 40)}`,
                fontSize: 11,
                lineHeight: 1.6,
                color: TEXT,
                fontStyle: "italic",
              }}
            >
              <span style={{ fontStyle: "normal", marginRight: 6 }}>🧭</span>
              {narrative.text}
              <div
                style={{
                  fontStyle: "normal",
                  fontSize: 9,
                  color: MUTED,
                  marginTop: 5,
                }}
              >
                Narrativa IA · {relTime(narrative.generated_at)}
              </div>
            </div>
          )}

          {/* ── Breakdown del score técnico (con barras visuales) ─────────── */}
          <SectionTitle>📊 Breakdown del score · Total {s.breakdown.total}/100</SectionTitle>
          <div style={{ marginBottom: 12 }}>
            <ScoreBar label="RVOL"     value={s.breakdown.rvol}           max={25} />
            <ScoreBar label="Squeeze"  value={s.breakdown.bb_squeeze}     max={15} />
            <ScoreBar label="RSI"      value={s.breakdown.rsi}            max={20} />
            <ScoreBar label="Range"    value={s.breakdown.range_position} max={15} />
            <ScoreBar label="Futures"  value={s.breakdown.futures}        max={20} disabled={!s.indicators.has_futures} />
            <ScoreBar label="F&G"      value={s.breakdown.fng_modulator}  max={5}  />
          </div>

          {/* ── Indicadores numéricos exactos ─────────────────────────────── */}
          <SectionTitle>Indicadores</SectionTitle>
          <Grid>
            <Indicator
              label="RVOL"
              value={`${s.indicators.rvol.toFixed(2)}x`}
              hint="Volumen vs SMA(20)"
              highlight={s.indicators.rvol >= 2}
            />
            <Indicator
              label="BB Squeeze"
              value={s.indicators.bb_squeeze.toFixed(2)}
              hint="0-1 · 1 = comprimido"
              highlight={s.indicators.bb_squeeze >= 0.7}
            />
            <Indicator
              label="RSI 14"
              value={`${Math.round(s.indicators.rsi)}${s.indicators.rsi_bullish_divergence ? " ⚡" : ""}`}
              hint={
                s.indicators.rsi_bullish_divergence
                  ? "Divergencia alcista"
                  : s.indicators.rsi < 30
                  ? "Sobrevendido"
                  : s.indicators.rsi > 70
                  ? "Sobrecomprado"
                  : "Neutral"
              }
              highlight={s.indicators.rsi_bullish_divergence || s.indicators.rsi < 35}
            />
            <Indicator
              label="Range 90d"
              value={`${(s.indicators.range_position_90d * 100).toFixed(0)}%`}
              hint="0 = low · 100 = high"
              highlight={s.indicators.range_position_90d < 0.3}
            />
            <Indicator
              label="Bajo ATH"
              value={`${s.indicators.ath_distance_pct.toFixed(1)}%`}
              hint="Lejos del máximo histórico"
              highlight={s.indicators.ath_distance_pct >= 50 && s.indicators.ath_distance_pct <= 75}
            />
            {s.indicators.has_futures ? (
              <>
                <Indicator
                  label="Funding"
                  value={
                    s.indicators.funding_rate !== null
                      ? `${(s.indicators.funding_rate * 100).toFixed(4)}%`
                      : "—"
                  }
                  hint={
                    s.indicators.funding_rate !== null && s.indicators.funding_rate < 0
                      ? "Shorts pagan (alcista)"
                      : "Longs pagan"
                  }
                  highlight={
                    s.indicators.funding_rate !== null && s.indicators.funding_rate < -0.0001
                  }
                />
                <Indicator
                  label="OI 24h"
                  value={
                    s.indicators.oi_change_24h !== null
                      ? `${s.indicators.oi_change_24h >= 0 ? "+" : ""}${s.indicators.oi_change_24h.toFixed(1)}%`
                      : "—"
                  }
                  hint="Cambio Open Interest"
                  highlight={
                    s.indicators.oi_change_24h !== null && s.indicators.oi_change_24h > 5
                  }
                />
              </>
            ) : (
              <Indicator label="Futures" value="N/D" hint="Sin contrato perpetuo" />
            )}
          </Grid>

          {/* ── Disenso con Claude ────────────────────────────────────────── */}
          <SectionTitle>🤝 Análisis técnico vs IA fundamental</SectionTitle>
          <DisagreementBlock signal={s} />

          {/* ── Outcomes del forward-test ─────────────────────────────────── */}
          {s.outcomes && (s.outcomes.closed_7d || s.outcomes.closed_14d || s.outcomes.closed_30d) && (
            <>
              <SectionTitle>📈 Forward-test · Outcomes</SectionTitle>
              <Grid minCol={100}>
                <OutcomeCell label="7d"  pct={s.outcomes.change_7d_pct}  closed={s.outcomes.closed_7d} />
                <OutcomeCell label="14d" pct={s.outcomes.change_14d_pct} closed={s.outcomes.closed_14d} />
                <OutcomeCell label="30d" pct={s.outcomes.change_30d_pct} closed={s.outcomes.closed_30d} />
                {s.outcomes.peak_pct !== undefined && (
                  <OutcomeCell
                    label={`Peak (${s.outcomes.days_to_peak?.toFixed(1)}d)`}
                    pct={s.outcomes.peak_pct}
                    closed={true}
                  />
                )}
              </Grid>
            </>
          )}

          {/* ── Datos de detección ────────────────────────────────────────── */}
          <SectionTitle>🕐 Detección</SectionTitle>
          <Grid minCol={140}>
            <DataPair label="Detectada" value={detectedAgo} />
            <DataPair label="Precio entonces" value={fmtPrice(s.detection_price)} />
            {s.outcomes?.last_observed_price && (
              <>
                <DataPair label="Precio actual" value={fmtPrice(s.outcomes.last_observed_price)} />
                <DataPair
                  label="% desde detección"
                  value={
                    s.detection_price > 0
                      ? `${(((s.outcomes.last_observed_price - s.detection_price) / s.detection_price) * 100).toFixed(2)}%`
                      : "—"
                  }
                  valueColor={
                    s.outcomes.last_observed_price >= s.detection_price ? GREEN : ACCENT
                  }
                />
              </>
            )}
          </Grid>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes de la card expandida ────────────────────────────────────

function ScoreBar({
  label,
  value,
  max,
  disabled = false,
}: {
  label: string;
  value: number;
  max: number;
  disabled?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const fillColor = disabled
    ? MUTED
    : pct >= 80
    ? GREEN
    : pct >= 50
    ? ORANGE
    : ACCENT;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr 60px",
        gap: 8,
        alignItems: "center",
        marginBottom: 4,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ fontSize: 10, color: SUB, fontWeight: 600 }}>{label}</span>
      <div
        style={{
          background: tint(BORDER, 50),
          borderRadius: 4,
          height: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: fillColor,
            width: `${pct}%`,
            height: "100%",
            transition: "width .3s",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          color: MUTED,
          fontFamily: "monospace",
          textAlign: "right",
        }}
      >
        {value.toFixed(1)}/{max}
      </span>
    </div>
  );
}

function Indicator({
  label,
  value,
  hint,
  highlight = false,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: MUTED,
          marginBottom: 1,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: highlight ? ACCENT : TEXT,
          fontFamily: "monospace",
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>{hint}</div>
      )}
    </div>
  );
}

function DataPair({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>{label}</div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: valueColor ?? SUB,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function OutcomeCell({
  label,
  pct,
  closed,
}: {
  label: string;
  pct?: number;
  closed?: boolean;
}) {
  if (pct === undefined) {
    return <DataPair label={label} value="—" />;
  }
  const col = pct >= 0 ? GREEN : ACCENT;
  return (
    <div>
      <div style={{ fontSize: 9, color: MUTED, marginBottom: 1 }}>
        {label} {!closed && <span style={{ fontStyle: "italic" }}>(abierto)</span>}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: col,
          fontFamily: "monospace",
          opacity: closed ? 1 : 0.65,
        }}
      >
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(2)}%
      </div>
    </div>
  );
}

function DisagreementBlock({ signal: s }: { signal: RadarSignal }) {
  const claudeSig = s.claude_signal;
  const claudeScore = s.claude_score;

  // Texto explicativo según el tipo de agreement
  let explanation: string;
  let icon: string;
  let color: string;

  switch (s.agreement) {
    case "AGREE":
      icon = "✓";
      color = GREEN;
      explanation = `Ambos análisis coinciden: técnicos sugieren ${s.technical_score >= 65 ? "setup alcista" : "setup débil"} y Claude lo respalda con señal ${claudeSig}.`;
      break;
    case "DISAGREE_BULL":
      icon = "⚠";
      color = ACCENT;
      explanation = `Los técnicos se ven alcistas (score ${s.technical_score}) pero Claude marcó EVITAR. Posibles razones de Claude: fundamentos débiles, alta concentración whale, baja confianza en el proyecto. Vale la pena revisar manualmente.`;
      break;
    case "DISAGREE_BEAR":
      icon = "✓";
      color = ORANGE;
      explanation = `Claude marcó ${claudeSig} pero los técnicos están débiles (score ${s.technical_score}). Claude puede estar viendo fundamentales que los indicadores aún no reflejan, o el setup técnico todavía no maduró.`;
      break;
    default:
      icon = "—";
      color = MUTED;
      explanation = claudeSig
        ? `Sin desacuerdo claro. Técnicos: ${s.technical_score}/100. Claude: ${claudeSig} (score ${claudeScore ?? "?"}).`
        : "Claude no analizó este token en el último escaneo.";
  }

  return (
    <div
      style={{
        background: tint(color, 8),
        border: `1px solid ${tint(color, 25)}`,
        borderRadius: 7,
        padding: "8px 10px",
        marginBottom: 10,
        fontSize: 11,
        lineHeight: 1.5,
        color: SUB,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
        <span style={{ color, fontSize: 13, fontWeight: 700 }}>{icon}</span>
        <strong style={{ color, fontSize: 11 }}>
          {s.agreement === "AGREE"
            ? "Análisis coincidentes"
            : s.agreement === "DISAGREE_BULL"
            ? "Disenso: técnicos alcistas, Claude evitar"
            : s.agreement === "DISAGREE_BEAR"
            ? "Disenso: Claude positivo, técnicos débiles"
            : "Análisis neutro"}
        </strong>
      </div>
      <div>{explanation}</div>
      {claudeSig && (
        <div style={{ fontSize: 10, color: MUTED, marginTop: 6 }}>
          Claude dijo: <strong style={{ color: SIG_COLOR[claudeSig] ?? MUTED }}>{claudeSig}</strong>
          {claudeScore !== null && ` con score ${claudeScore}`}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAgreementMeta(a: ClaudeAgreement): {
  label: string;
  color: string;
  tooltip: string;
} | null {
  switch (a) {
    case "DISAGREE_BULL":
      return {
        label: "⚠ Claude EVITAR",
        color: ACCENT,
        tooltip: "Los técnicos se ven alcistas pero Claude detectó algo problemático.",
      };
    case "DISAGREE_BEAR":
      return {
        label: "✓ Claude ACUMULAR",
        color: ORANGE,
        tooltip: "Claude ve potencial que los técnicos no reflejan.",
      };
    case "AGREE":
      return {
        label: "✓ Claude OK",
        color: GREEN,
        tooltip: "Análisis técnico y fundamental coinciden.",
      };
    default:
      return null;
  }
}

function scoreColor(score: number): string {
  if (score >= 65) return GREEN;
  if (score >= 40) return ORANGE;
  return MUTED;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        color: MUTED,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: "uppercase",
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

function Grid({
  children,
  minCol = 130,
}: {
  children: React.ReactNode;
  minCol?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minCol}px, 1fr))`,
        gap: "8px 14px",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}