"use client";

import { COLORS } from "@/lib/constants";

const { BG, BORDER, MUTED, ACCENT } = COLORS;

interface Props {
  expanded: boolean;
  onClick: () => void;
  title?: string;
}

/**
 * Botón ⛶ / ✕ que toggle entre vista normal y vista expandida (100% ancho).
 * Cambio visual fuerte entre estados: fondo + color + icono cambian.
 */
export default function ExpandButton({ expanded, onClick, title }: Props) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={expanded ? "Contraer panel" : "Expandir panel"}
      title={
        title ?? (expanded ? "Cerrar vista expandida" : "Expandir a 100% ancho")
      }
      style={{
        width: 26,
        height: 26,
        borderRadius: 6,
        border: `1px solid ${expanded ? ACCENT : BORDER}`,
        background: expanded
          ? `color-mix(in srgb, ${ACCENT} 15%, transparent)`
          : BG,
        color: expanded ? ACCENT : MUTED,
        cursor: "pointer",
        fontSize: 13,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontWeight: expanded ? 700 : 400,
        transition: "all .15s",
      }}
    >
      {expanded ? "✕" : "⛶"}
    </button>
  );
}