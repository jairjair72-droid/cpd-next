"use client";

import { useEffect, useRef } from "react";
import { COLORS, SIG_COLOR, RISK_DOT, RISK_LABEL, HORIZON_LABEL } from "@/lib/constants";
import { fmtUSD, fmtSupply, fmtPct, fmtDate, fmtPrice } from "@/lib/formatters";
import { cmcUrl } from "@/lib/client/api";
import type { CandidateToken } from "@/lib/types";
import ScoreBadge from "./ScoreBadge";
import Sparkline from "./Sparkline";
import { DetailRow, LinkBtn } from "./DetailRow";

interface Props {
  tok: CandidateToken;
  expanded: boolean;
  onToggle: () => void;
  podiumRank?: number;
}

// Helper para mezclar un color con transparente. Reemplaza el viejo `col + "18"`.
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

export default function TokenCard({ tok, expanded, onToggle, podiumRank }: Props) {
  const { BG, BORDER, CARD_INNER, SUB, MUTED, ACCENT, GREEN, ORANGE } = COLORS;
  const sigCol = SIG_COLOR[tok.signal] ?? MUTED;
  const riskCol = RISK_DOT[tok.risk] ?? MUTED;
  const dominance = tok.mcap_usd && tok.has_full_data
    ? (tok.mcap_usd / 3_500_000_000_000) * 100
    : null;

  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (expanded && cardRef.current) {
      const t = setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 60);
      return () => clearTimeout(t);
    }
  }, [expanded]);

  return (
    <div
      ref={cardRef}
      className="fa"
      style={{
        background: BG,
        borderRadius: 8,
        borderLeft: `3px solid ${sigCol}`,
        overflow: "hidden",
        transition: "all .25s",
        flexShrink: 0,
      }}
    >
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
        <div style={{ position: "relative", flexShrink: 0 }}>
          <ScoreBadge score={tok.score} size={36} />
          {podiumRank !== undefined && podiumRank <= 3 && (
            <span
              style={{
                position: "absolute",
                top: -6,
                left: -6,
                fontSize: 16,
                lineHeight: 1,
                // sombra suave para que despegue del fondo del card
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
                pointerEvents: "none",
              }}
              title={`Top ${podiumRank} por score`}
              aria-label={`Posición ${podiumRank} del podio`}
            >
              {["🥇", "🥈", "🥉"][podiumRank - 1]}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 2 }}>
            {tok.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tok.image} alt="" width={16} height={16} style={{ borderRadius: "50%" }} />
            )}
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 13, fontWeight: 700 }}>
              {tok.symbol}
            </span>
            {tok.rank && (
              <span
                style={{
                  background: tint(ACCENT, 8),
                  color: ACCENT,
                  border: `1px solid ${tint(ACCENT, 20)}`,
                  borderRadius: 4,
                  padding: "0 4px",
                  fontSize: 8,
                  fontWeight: 700,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                #{tok.rank}
              </span>
            )}
            <span
              style={{
                background: tint(sigCol, 10),
                color: sigCol,
                border: `1px solid ${tint(sigCol, 27)}`,
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: 8,
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {tok.signal}
            </span>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: riskCol,
                display: "inline-block",
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: SUB, fontFamily: "'Inter', sans-serif", marginBottom: 2 }}>
            {tok.reason}
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              fontSize: 9,
              color: MUTED,
              fontFamily: "'Inter', sans-serif",
              flexWrap: "wrap",
            }}
          >
            <span>{fmtPrice(tok.price)}</span>
            <span>Vol {fmtUSD(tok.vol24h)}</span>
            <span style={{ color: tok.change_7d >= 0 ? GREEN : ACCENT }}>
              {tok.change_7d >= 0 ? "+" : ""}
              {tok.change_7d}% 7d
            </span>
            <span>{tok.ath_distance_pct.toFixed(1)}% del ATH</span>
          </div>
        </div>
        <Sparkline data={tok.price_history} color={sigCol} width={52} height={22} />
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

      {expanded && (
        <div
          style={{
            padding: "10px 12px 14px 12px",
            borderTop: `1px solid ${BORDER}`,
            // ANTES: "#fffdf7" hardcoded → ahora respeta el tema
            background: CARD_INNER,
            fontFamily: "'Inter', sans-serif",
          }}
        >
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
              <span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}>({tok.symbol})</span>
            </div>
            {!tok.has_full_data && (
              <div style={{ fontSize: 9, color: ORANGE, marginTop: 2 }}>
                ⚠ Datos limitados — token no encontrado en CoinMarketCap/CoinGecko
              </div>
            )}
            {tok.has_full_data && (
              <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
                Metadata: {tok.meta_source === "cmc" ? "CoinMarketCap" : "CoinGecko"}
              </div>
            )}
          </div>

          <SectionTitle>Mercado</SectionTitle>
          <Grid>
            <DetailRow label="Capitalización" value={fmtUSD(tok.mcap_usd)} />
            <DetailRow label="Cap. diluida (FDV)" value={fmtUSD(tok.fdv_usd)} />
            <DetailRow label="Volumen 24h" value={fmtUSD(tok.vol24h)} />
            <DetailRow label="Vol / Cap. mercado" value={(tok.vol_mcap_ratio * 100).toFixed(2) + "%"} />
            {dominance && <DetailRow label="Dominancia" value={dominance.toFixed(4) + "%"} />}
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
            <DetailRow label="Operaciones 24h" value={tok.tradeCount.toLocaleString("es")} />
          </Grid>

          {(tok.circulating_supply || tok.total_supply || tok.max_supply) && (
            <>
              <SectionTitle>Suministro</SectionTitle>
              <Grid>
                <DetailRow label="Suministro circulante" value={fmtSupply(tok.circulating_supply, tok.symbol)} />
                <DetailRow label="Suministro total" value={fmtSupply(tok.total_supply, tok.symbol)} />
                <DetailRow label="Suministro máximo" value={fmtSupply(tok.max_supply, tok.symbol)} />
              </Grid>
            </>
          )}

          {(tok.ath_price || tok.atl_price) && (
            <>
              <SectionTitle>Históricos</SectionTitle>
              <Grid minCol={160}>
                {tok.ath_price && (
                  <DetailRow
                    label="Máximo histórico (ATH)"
                    value={fmtPrice(tok.ath_price)}
                    subtitle={fmtDate(tok.ath_date)}
                  />
                )}
                {tok.atl_price && (
                  <DetailRow
                    label="Mínimo histórico (ATL)"
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
              valueColor={tok.score >= 75 ? ACCENT : tok.score >= 50 ? ORANGE : GREEN}
            />
            <DetailRow label="Señal" value={tok.signal} valueColor={sigCol} />
            <DetailRow label="Riesgo" value={RISK_LABEL[tok.risk] ?? tok.risk} valueColor={riskCol} />
            <DetailRow label="Horizonte" value={HORIZON_LABEL[tok.hodl_horizon] ?? tok.hodl_horizon ?? "—"} />
            <DetailRow label="Tipo" value={tok.type} />
            <DetailRow
              label="Flujo exchange"
              value={tok.exchange_netflow < 0 ? "↓ Saliendo (alcista)" : "↑ Entrando"}
              valueColor={tok.exchange_netflow < 0 ? GREEN : ORANGE}
            />
          </Grid>

          <SectionTitle>Enlaces</SectionTitle>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <LinkBtn href={`https://www.binance.com/es/trade/${tok.symbol}_USDT`}>Binance</LinkBtn>
            <LinkBtn href={`https://www.coingecko.com/es/monedas/${(tok.slug ?? tok.symbol).toLowerCase()}`}>
              CoinGecko
            </LinkBtn>
            <LinkBtn href={cmcUrl(tok)}>CoinMarketCap</LinkBtn>
            <LinkBtn href={`https://www.tradingview.com/symbols/${tok.symbol}USDT/`}>TradingView</LinkBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        color: COLORS.MUTED,
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

function Grid({ children, minCol = 140 }: { children: React.ReactNode; minCol?: number }) {
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