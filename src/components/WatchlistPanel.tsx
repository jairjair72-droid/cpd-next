"use client";

import { useMemo, useState } from "react";
import { COLORS, SIG_COLOR, RISK_DOT, RISK_LABEL, HORIZON_LABEL } from "@/lib/constants";
import { fmtPrice, fmtUSD, fmtSupply, fmtPct, fmtDate, relTime } from "@/lib/formatters";
import { cmcUrl } from "@/lib/client/api";
import { latestSnapshotOf, pctSinceAdded, snapshotsOf } from "@/lib/watchlist";
import ExpandButton from "./ExpandButton";
import SymbolAutocomplete from "./SymbolAutocomplete";
import PanelHeader from "@/components/PanelHeader";
import ScoreBadge from "./ScoreBadge";
import Sparkline from "./Sparkline";
import { DetailRow, LinkBtn } from "./DetailRow";
import type {
  Signal,
  WatchlistEntry,
  WatchlistSnapshot,
  CandidateToken,
} from "@/lib/types";
import type { SymbolEntry } from "@/lib/client/api";

const { CARD, CARD_INNER, BORDER, BG, TEXT, SUB, MUTED, ACCENT, ORANGE, GREEN } = COLORS;

const tint = (c: string, pct: number) =>
  `color-mix(in srgb, ${c} ${pct}%, transparent)`;

interface Props {
  entries: WatchlistEntry[];
  history: WatchlistSnapshot[];
  candidates: CandidateToken[];
  maxRows?: number;
  // ANTES: expanded + onToggleExpand
  isFocused: boolean;
  onToggleFocus: () => void;
  compact: boolean;
  onAdd: (entry: SymbolEntry, currentPrice: number | undefined) => void;
  onRemove: (symbol: string) => void;
  onUpdate: (symbol: string, updates: Partial<WatchlistEntry>) => void;
}

export default function WatchlistPanel({
  entries,
  history,
  candidates,
  isFocused,
  onToggleFocus,
  compact,
  onAdd,
  onRemove,
  onUpdate,
}: Props) {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  // Mapa precio actual por símbolo
  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) m.set(c.symbol, c.price);
    for (const e of entries) {
      if (!m.has(e.symbol)) {
        const snap = latestSnapshotOf(history, e.symbol);
        if (snap) m.set(e.symbol, snap.price);
      }
    }
    return m;
  }, [candidates, entries, history]);

  // Mapa del candidato completo por símbolo (para la info expandida)
  const candidateMap = useMemo(() => {
    const m = new Map<string, CandidateToken>();
    for (const c of candidates) m.set(c.symbol, c);
    return m;
  }, [candidates]);

  const excluded = useMemo(
    () => new Set(entries.map((e) => e.symbol)),
    [entries],
  );

  const sorted = useMemo(() => {
    return [...entries]
      .map((e) => ({
        entry: e,
        currentPrice: priceMap.get(e.symbol),
        pct: pctSinceAdded(e, priceMap.get(e.symbol)),
      }))
      .sort((a, b) => {
        if (a.pct === null && b.pct === null) return 0;
        if (a.pct === null) return 1;
        if (b.pct === null) return -1;
        return b.pct - a.pct;
      });
  }, [entries, priceMap]);

  const visible = sorted;

  const handleAdd = (s: SymbolEntry) => {
    onAdd(s, priceMap.get(s.symbol));
  };

  return (
    <div
      className={`dash-panel ${compact ? "panel-compact" : ""}`}
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
        title="👁️ Watchlist"
        subtitle={
          entries.length === 0
            ? "Sin tokens en watch"
            : `${entries.length} tokens · ordenados por % desde added`
        }
        isFocused={isFocused}
        onToggleFocus={onToggleFocus}
      />

      <div className="panel-inner panel-inner--single">
        {/* Buscador siempre visible, aunque la lista esté vacía */}
        <div className="panel-tokens-header">
          <SymbolAutocomplete
            onSelect={handleAdd}
            excludeSymbols={excluded}
            placeholder="Agregar token"
          />
        </div>

        {entries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="scroll-y" style={{ gap: 6, paddingRight: 2 }}>
            {visible.map(({ entry, currentPrice, pct }) => (
              <WatchCard
                key={entry.symbol}
                entry={entry}
                currentPrice={currentPrice}
                pct={pct}
                candidate={candidateMap.get(entry.symbol)}
                latest={latestSnapshotOf(history, entry.symbol)}
                snapshots={snapshotsOf(history, entry.symbol)}
                expanded={expandedSymbol === entry.symbol}
                onToggle={() => {
                  if (compact) return;
                  setExpandedSymbol((s) => (s === entry.symbol ? null : entry.symbol));
                }}
                onRemove={() => {
                  if (confirm(`¿Quitar ${entry.symbol} de la watchlist?`)) {
                    onRemove(entry.symbol);
                    if (expandedSymbol === entry.symbol) setExpandedSymbol(null);
                  }
                }}
                onUpdate={(updates) => onUpdate(entry.symbol, updates)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

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
      <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.5 }}>👁️</div>
      Sin tokens en watchlist.
      <br />
      <span style={{ fontSize: 10 }}>
        Agregá desde el buscador del header.
      </span>
    </div>
  );
}

// ─── Card expandible ────────────────────────────────────────────────────────

interface CardProps {
  entry: WatchlistEntry;
  currentPrice: number | undefined;
  pct: number | null;
  candidate: CandidateToken | undefined;
  latest: WatchlistSnapshot | null;
  snapshots: WatchlistSnapshot[];
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (updates: Partial<WatchlistEntry>) => void;
}

function WatchCard({
  entry,
  currentPrice,
  pct,
  candidate: tok,
  latest,
  snapshots,
  expanded,
  onToggle,
  onRemove,
  onUpdate,
}: CardProps) {
  const pctCol = pct === null ? MUTED : pct >= 0 ? GREEN : ACCENT;
  const claudeSig = latest?.claude_signal;
  const sigCol = claudeSig ? (SIG_COLOR[claudeSig] ?? MUTED) : MUTED;
  const techScore = latest?.technical_score;

  const sparkData = useMemo(() => snapshots.map((s) => s.price), [snapshots]);

  return (
    <div
      className="fa"
      style={{
        background: BG,
        borderRadius: 8,
        borderLeft: `3px solid ${pctCol}`,
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Header de la card (clickeable, mismo estilo que TokenCard) */}
      <div
        onClick={onToggle}
        style={{
          padding: "8px 10px",
          display: "flex",
          gap: 8,
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
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
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {entry.symbol}
            </span>
            <span style={{ fontSize: 10, color: SUB }}>
              {currentPrice ? fmtPrice(currentPrice) : "—"}
            </span>
            {pct !== null && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: pctCol,
                }}
              >
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(2)}%
              </span>
            )}
            {claudeSig && (
              <span
                style={{
                  background: tint(sigCol, 12),
                  color: sigCol,
                  border: `1px solid ${tint(sigCol, 30)}`,
                  borderRadius: 4,
                  padding: "1px 5px",
                  fontSize: 8,
                  fontWeight: 700,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {claudeSig}
              </span>
            )}
            {techScore !== null && techScore !== undefined && (
              <span
                style={{
                  fontSize: 9,
                  color: MUTED,
                  fontFamily: "'Inter', sans-serif",
                }}
                title="Score técnico del Radar"
              >
                Radar: <strong style={{ color: TEXT }}>{techScore}</strong>
              </span>
            )}
            {(entry.threshold_score !== undefined || entry.threshold_signal) && (
              <span
                style={{ fontSize: 9, color: ORANGE }}
                title="Tiene umbrales configurados"
              >
                ⚡
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 9,
              color: MUTED,
              fontFamily: "'Inter', sans-serif",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>Agregado {relTime(entry.added_at)}</span>
            <span>@ {fmtPrice(entry.added_price)}</span>
            {snapshots.length > 0 && <span>{snapshots.length} snapshots</span>}
          </div>
        </div>

        {sparkData.length >= 2 && (
          <Sparkline data={sparkData} color={pctCol} width={52} height={22} />
        )}

        {/* Botón de eliminar — atajo rápido sin expandir la card.
            stopPropagation evita que el click expanda/colapse la card. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Quitar ${entry.symbol} de la watchlist`}
          title="Quitar de la watchlist"
          style={{
            width: 30,
            height: 30,
            fontSize: 16,
            borderRadius: 5,
            border: `1px solid ${tint(ACCENT, 25)}`,
            background: tint(ACCENT, 6),
            color: ACCENT,
            cursor: "pointer",
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginLeft: 4,
            transition: "all .15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = tint(ACCENT, 18);
            e.currentTarget.style.borderColor = tint(ACCENT, 50);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = tint(ACCENT, 6);
            e.currentTarget.style.borderColor = tint(ACCENT, 25);
          }}
        >
          🗑
        </button>

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

      {/* Contenido expandido — toda la info del Discover + features propias */}
      {expanded && (
        <div
          style={{
            padding: "10px 12px 14px 12px",
            borderTop: `1px solid ${BORDER}`,
            background: CARD_INNER,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {/* Nombre completo si tenemos el candidato */}
          {tok && (
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: ACCENT,
                  fontFamily: "'Playfair Display', serif",
                }}
              >
                {tok.name}{" "}
                <span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}>
                  ({entry.symbol})
                </span>
              </div>
              {tok.has_full_data && (
                <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
                  Metadata: {tok.meta_source === "cmc" ? "CoinMarketCap" : "CoinGecko"}
                </div>
              )}
            </div>
          )}

          {/* ── Configuración de watchlist ───────────────────────────────── */}
          <SectionTitle>⚡ Alertas — Umbrales</SectionTitle>
          <Grid minCol={220}>
            <div>
              <FieldLabel>Alertar si score técnico cruza:</FieldLabel>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="ej: 70"
                value={entry.threshold_score ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onUpdate({
                    threshold_score:
                      v === "" ? undefined : Math.max(0, Math.min(100, +v)),
                  });
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <FieldLabel>Alertar si Claude cambia a:</FieldLabel>
              <select
                value={entry.threshold_signal ?? ""}
                onChange={(e) => {
                  const v = e.target.value as Signal | "";
                  onUpdate({
                    threshold_signal: v === "" ? undefined : (v as Signal),
                  });
                }}
                onClick={(e) => e.stopPropagation()}
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
                <option value="">— sin umbral —</option>
                <option value="OBSERVAR">OBSERVAR o mejor</option>
                <option value="ACUMULAR">solo ACUMULAR</option>
              </select>
            </div>
          </Grid>

          <div style={{ marginBottom: 10 }}>
            <FieldLabel>Notas (¿por qué te interesa?)</FieldLabel>
            <input
              type="text"
              placeholder="ej: Tesis bullish post-halving..."
              value={entry.notes ?? ""}
              onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* ── Info estilo TokenCard (Mercado / Suministro / Históricos / IA) ── */}
          {tok ? (
            <>
              <SectionTitle>Mercado</SectionTitle>
              <Grid>
                <DetailRow label="Capitalización" value={fmtUSD(tok.mcap_usd)} />
                <DetailRow label="Cap. diluida (FDV)" value={fmtUSD(tok.fdv_usd)} />
                <DetailRow label="Volumen 24h" value={fmtUSD(tok.vol24h)} />
                <DetailRow
                  label="Vol / Cap. mercado"
                  value={(tok.vol_mcap_ratio * 100).toFixed(2) + "%"}
                />
                <DetailRow
                  label="Cambio 24h"
                  value={fmtPct(tok.change_24h)}
                  valueColor={tok.change_24h >= 0 ? GREEN : ACCENT}
                />
                <DetailRow
                  label="Cambio 7d"
                  value={fmtPct(tok.change_7d)}
                  valueColor={tok.change_7d >= 0 ? GREEN : ACCENT}
                />
                <DetailRow
                  label="Cambio 30d"
                  value={fmtPct(tok.change_30d)}
                  valueColor={tok.change_30d >= 0 ? GREEN : ACCENT}
                />
                <DetailRow label="Máx. 24h" value={fmtPrice(tok.high24h)} />
                <DetailRow label="Mín. 24h" value={fmtPrice(tok.low24h)} />
                <DetailRow
                  label="Operaciones 24h"
                  value={tok.tradeCount.toLocaleString("es")}
                />
              </Grid>

              {(tok.circulating_supply || tok.total_supply || tok.max_supply) && (
                <>
                  <SectionTitle>Suministro</SectionTitle>
                  <Grid>
                    <DetailRow
                      label="Suministro circulante"
                      value={fmtSupply(tok.circulating_supply, tok.symbol)}
                    />
                    <DetailRow
                      label="Suministro total"
                      value={fmtSupply(tok.total_supply, tok.symbol)}
                    />
                    <DetailRow
                      label="Suministro máximo"
                      value={fmtSupply(tok.max_supply, tok.symbol)}
                    />
                  </Grid>
                </>
              )}

              {(tok.ath_price || tok.atl_price) && (
                <>
                  <SectionTitle>Históricos</SectionTitle>
                  <Grid minCol={160}>
                    {tok.ath_price && (
                      <DetailRow
                        label="ATH"
                        value={fmtPrice(tok.ath_price)}
                        subtitle={fmtDate(tok.ath_date)}
                      />
                    )}
                    {tok.atl_price && (
                      <DetailRow
                        label="ATL"
                        value={fmtPrice(tok.atl_price)}
                        subtitle={fmtDate(tok.atl_date)}
                      />
                    )}
                  </Grid>
                </>
              )}

              <SectionTitle>Análisis IA</SectionTitle>
              <Grid minCol={120}>
                <DetailRow
                  label="Score"
                  value={`${tok.score} / 100`}
                  valueColor={
                    tok.score >= 75 ? ACCENT : tok.score >= 50 ? ORANGE : GREEN
                  }
                />
                <DetailRow
                  label="Señal"
                  value={tok.signal}
                  valueColor={SIG_COLOR[tok.signal] ?? MUTED}
                />
                <DetailRow
                  label="Riesgo"
                  value={RISK_LABEL[tok.risk] ?? tok.risk}
                  valueColor={RISK_DOT[tok.risk] ?? MUTED}
                />
                <DetailRow
                  label="Horizonte"
                  value={HORIZON_LABEL[tok.hodl_horizon] ?? tok.hodl_horizon ?? "—"}
                />
              </Grid>

              <SectionTitle>Enlaces</SectionTitle>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                <LinkBtn href={`https://www.binance.com/es/trade/${tok.symbol}_USDT`}>
                  Binance
                </LinkBtn>
                <LinkBtn
                  href={`https://www.coingecko.com/es/monedas/${(tok.slug ?? tok.symbol).toLowerCase()}`}
                >
                  CoinGecko
                </LinkBtn>
                <LinkBtn href={cmcUrl(tok)}>CoinMarketCap</LinkBtn>
                <LinkBtn href={`https://www.tradingview.com/symbols/${tok.symbol}USDT/`}>
                  TradingView
                </LinkBtn>
              </div>
            </>
          ) : (
            <div
              style={{
                padding: 10,
                background: tint(ORANGE, 10),
                borderRadius: 7,
                fontSize: 10,
                color: ORANGE,
                marginBottom: 10,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              ⚠ Este token no estuvo en el último escaneo de Discover. Algunos datos
              detallados no están disponibles. Ejecutá Descubrir para refrescar.
            </div>
          )}

          {/* ── Mini historial de snapshots ───────────────────────────────── */}
          {snapshots.length > 0 && (
            <>
              <SectionTitle>📈 Historial · {snapshots.length} mediciones</SectionTitle>
              <div
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  background: BG,
                  borderRadius: 7,
                  padding: 6,
                  marginBottom: 12,
                }}
              >
                {[...snapshots].reverse().slice(0, 30).map((s) => (
                  <SnapRow key={s.ts} snap={s} basePrice={entry.added_price} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SnapRow({
  snap,
  basePrice,
}: {
  snap: WatchlistSnapshot;
  basePrice: number;
}) {
  const pct = basePrice > 0 ? ((snap.price - basePrice) / basePrice) * 100 : 0;
  const pctCol = pct >= 0 ? GREEN : ACCENT;
  const sigCol = snap.claude_signal ? (SIG_COLOR[snap.claude_signal] ?? MUTED) : MUTED;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 80px 70px 60px 60px",
        gap: 8,
        padding: "4px 6px",
        fontSize: 10,
        fontFamily: "'Inter', sans-serif",
        borderBottom: `1px solid ${tint(BORDER, 50)}`,
        alignItems: "center",
      }}
    >
      <span style={{ color: MUTED, fontSize: 9 }}>{relTime(snap.ts)}</span>
      <span style={{ color: TEXT, fontFamily: "monospace" }}>
        {fmtPrice(snap.price)}
      </span>
      <span style={{ color: pctCol, fontWeight: 600, fontFamily: "monospace" }}>
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
      {snap.claude_signal ? (
        <span style={{ color: sigCol, fontWeight: 600, fontSize: 9 }}>
          {snap.claude_signal}
        </span>
      ) : (
        <span style={{ color: MUTED }}>—</span>
      )}
      <span
        style={{ color: MUTED, fontFamily: "monospace", textAlign: "right" }}
      >
        {snap.technical_score !== null ? `R:${snap.technical_score}` : "—"}
      </span>
    </div>
  );
}

// ─── Helpers visuales (mismos que TokenCard) ────────────────────────────────

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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: 10,
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

function Grid({
  children,
  minCol = 140,
}: {
  children: React.ReactNode;
  minCol?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minCol}px, 1fr))`,
        gap: "6px 14px",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}