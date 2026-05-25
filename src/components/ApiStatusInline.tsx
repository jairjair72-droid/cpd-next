"use client";

import { COLORS } from "@/lib/constants";
import { relTime } from "@/lib/formatters";
import type { ApiStatus, ApiHealth } from "@/lib/types";

const { BG, BORDER, MUTED, GREEN, ORANGE, ACCENT } = COLORS;

function dotInfo(st: ApiHealth): { color: string; label: string } {
  if (st.ok === null) return { color: MUTED, label: "sin uso" };
  if (!st.ok) return { color: ACCENT, label: "error" };
  const stale = Date.now() - (st.ts ?? 0) > 30 * 60 * 1000;
  return {
    color: stale ? ORANGE : GREEN,
    label: relTime(st.ts),
  };
}

function Dot({ name, st }: { name: string; st: ApiHealth }) {
  const { color, label } = dotInfo(st);
  return (
    <span
      title={`${name}: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontFamily: "'Inter', sans-serif",
        color: MUTED,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          boxShadow:
            st.ok === true
              ? `0 0 5px color-mix(in srgb, ${color} 60%, transparent)`
              : "none",
          flexShrink: 0,
        }}
      />
      <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>
        {name}
      </strong>
    </span>
  );
}

interface Props {
  apiStatus: ApiStatus;
}

/**
 * Versión inline (no tarjeta) de los status de APIs. Se usa en la barra de
 * control del Dashboard, al lado de los botones de escaneo.
 */
export default function ApiStatusInline({ apiStatus }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "4px 10px",
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 7,
        flexWrap: "wrap",
      }}
    >
      <Dot name="Bin" st={apiStatus.binance} />
      <span style={{ color: BORDER }}>·</span>
      <Dot name="Mkt" st={apiStatus.marketdata} />
      <span style={{ color: BORDER }}>·</span>
      <Dot name="AI" st={apiStatus.anthropic} />
    </div>
  );
}