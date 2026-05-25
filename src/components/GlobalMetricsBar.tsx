"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/constants";
import { fmtUSD } from "@/lib/formatters";
import { getGlobalMetrics } from "@/lib/client/api";

interface Metrics {
  btc_dominance: number;
  eth_dominance: number;
  total_market_cap: number;
  total_volume_24h: number;
  active_cryptocurrencies: number;
}

const REFRESH_MS = 5 * 60 * 1000;

export default function GlobalMetricsBar() {
  const { CARD, BORDER, MUTED, SUB, ACCENT } = COLORS;
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMetrics = async () => {
    try {
      const r = await getGlobalMetrics();
      setM(r.global);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    timerRef.current = setInterval(fetchMetrics, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Sin datos y con error → mostramos algo discreto y no bloqueamos la UI
  if (err && !m) {
    return (
      <div
        style={{
          background: CARD,
          borderBottom: `1px solid ${BORDER}`,
          padding: "6px 24px",
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          color: MUTED,
          textAlign: "center",
        }}
      >
        Métricas globales no disponibles (CMC: {err})
      </div>
    );
  }

  return (
    <div
      style={{
        background: CARD,
        borderBottom: `1px solid ${BORDER}`,
        padding: "6px 24px",
        display: "flex",
        alignItems: "center",
        gap: 18,
        flexWrap: "wrap",
        fontFamily: "'Inter', sans-serif",
        fontSize: 10,
      }}
    >
      <div
        style={{
          color: MUTED,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        🌐 Mercado global
      </div>
      {loading && !m ? (
        <span style={{ color: MUTED }}>cargando...</span>
      ) : m ? (
        <>
          <Stat label="Cap. total" value={fmtUSD(m.total_market_cap)} color={ACCENT} />
          <Stat label="Vol 24h" value={fmtUSD(m.total_volume_24h)} color={SUB} />
          <Stat label="BTC dom" value={m.btc_dominance.toFixed(2) + "%"} color={ACCENT} />
          <Stat label="ETH dom" value={m.eth_dominance.toFixed(2) + "%"} color={SUB} />
          <Stat
            label="Activas"
            value={m.active_cryptocurrencies.toLocaleString("es")}
            color={SUB}
          />
          <span style={{ color: MUTED, marginLeft: "auto" }}>
            fuente: CoinMarketCap · cache 5min
          </span>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "baseline" }}>
      <span style={{ color: COLORS.MUTED }}>{label}:</span>
      <strong style={{ color, fontWeight: 700 }}>{value}</strong>
    </span>
  );
}
