"use client";

import { COLORS } from "@/lib/constants";
import { relTime } from "@/lib/formatters";
import type { GlobalNarrative } from "@/lib/types";

const { CARD, BORDER, MUTED, SUB, ACCENT, TEXT } = COLORS;

interface Props {
  narrative: GlobalNarrative | null;
  scanning: boolean;
}

/**
 * Banda con el resumen narrativo del último escaneo. Generado por Claude con
 * el system prompt anti-hype. Si no hay narrativa todavía, no renderiza nada
 * (no queremos ocupar espacio vacío).
 */
export default function NarrativeBanner({ narrative, scanning }: Props) {
  // Mientras escanea, mostramos un placeholder discreto si ya había una previa
  if (!narrative && !scanning) return null;

  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${ACCENT}`,
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 14,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13 }}>🧭</span>
        <span
          style={{
            fontSize: 10,
            color: MUTED,
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Resumen del escaneo
        </span>
        {narrative && (
          <span style={{ fontSize: 9, color: MUTED, marginLeft: "auto" }}>
            {relTime(narrative.generated_at)} · {narrative.scan_token_count} tokens ·{" "}
            {narrative.candidate_count} candidatos
          </span>
        )}
      </div>

      {scanning && !narrative ? (
        <div
          style={{
            fontSize: 12,
            color: MUTED,
            fontStyle: "italic",
          }}
        >
          Generando resumen del escaneo...
        </div>
      ) : narrative ? (
        <p
          style={{
            fontSize: 13,
            color: TEXT,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {narrative.text}
        </p>
      ) : null}

      {narrative && (
        <div
          style={{
            fontSize: 9,
            color: MUTED,
            marginTop: 8,
            fontStyle: "italic",
          }}
        >
          Generado por IA a partir de indicadores técnicos. No es asesoría
          financiera ni predicción.
        </div>
      )}
    </div>
  );
}