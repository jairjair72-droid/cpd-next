import { COLORS } from "@/lib/constants";

interface Props {
  score: number;
  size?: number;
}

export default function ScoreBadge({ score, size = 44 }: Props) {
  // Los umbrales tienen significado (alto score = rojo, bajo = verde), pero
  // los colores ahora respetan el tema activo.
  const col = score >= 75 ? COLORS.ACCENT : score >= 50 ? COLORS.ORANGE : COLORS.GREEN;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `3px solid ${col}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        // 18 hex = 9% alfa. Como ahora `col` es var(--...) no podemos hacer
        // `col + "18"`. Usamos color-mix() que respeta CSS variables.
        background: `color-mix(in srgb, ${col} 9%, transparent)`,
      }}
    >
      <span
        style={{
          fontSize: Math.round(size * 0.29),
          fontWeight: 800,
          color: col,
          fontFamily: "monospace",
        }}
      >
        {score}
      </span>
    </div>
  );
}