import type { Signal, Risk, Horizon } from "./types";

// ─── Sistema de colores ─────────────────────────────────────────────────────
//
// COLORS ahora devuelve strings con CSS variables. Los VALORES reales viven en
// globals.css en dos paletas (claro / oscuro). Esto permite cambiar de tema
// instantáneamente toggleando `data-theme="dark"` en <html>, sin re-renderear
// nada de React.
//
// REGLA: no agregues colores literales a este archivo. Si necesitás un color
// nuevo, definí una variable nueva en globals.css y referenciala acá.

export const COLORS = {
  // Neutros — INVIERTEN con el tema
  BG:     "var(--color-bg)",
  CARD:   "var(--color-card)",
  CARD_INNER: "var(--color-card-inner)", // fondo de bloques expandidos (más claro que CARD en light, más profundo en dark)
  BORDER: "var(--color-border)",
  TEXT:   "var(--color-text)",
  SUB:    "var(--color-text-soft)",
  MUTED:  "var(--color-text-mute)",

  // Semánticos — mantienen significado, pero ajustan brillo según tema
  ACCENT: "var(--color-accent)", // rojo principal
  ORANGE: "var(--color-warning)",
  GREEN:  "var(--color-success)",
} as const;

// ─── Stablecoins / pares que filtramos ──────────────────────────────────────
export const STABLECOINS = new Set<string>([
  "USDC","BUSD","TUSD","USDP","DAI","FDUSD","PYUSD","USDT",
  "EUR","BRL","GBP","TRY","ARS","WBTC","BETH","STETH","WETH",
]);

// ─── Mapeos de UI ────────────────────────────────────────────────────────────
export const SIG_COLOR: Record<Signal, string> = {
  ACUMULAR: COLORS.GREEN,
  OBSERVAR: COLORS.ORANGE,
  EVITAR:   COLORS.MUTED,
};

export const RISK_DOT: Record<Risk, string> = {
  LOW:     COLORS.GREEN,
  MEDIUM:  COLORS.ORANGE,
  HIGH:    COLORS.ACCENT,
  EXTREME: "var(--color-risk-extreme)", // violeta — propio del sistema, tema-aware
};

export const RISK_LABEL: Record<Risk, string> = {
  LOW: "Bajo",
  MEDIUM: "Medio",
  HIGH: "Alto",
  EXTREME: "Extremo",
};

export const HORIZON_LABEL: Record<Horizon, string> = {
  short: "Corto plazo",
  mid: "Mediano plazo",
  long: "Largo plazo",
};

export const SIGNAL_RANK: Record<Signal, number> = {
  ACUMULAR: 2,
  OBSERVAR: 1,
  EVITAR: 0,
};

// ─── Prompt del analista (idéntico al original) ─────────────────────────────
export const SYSTEM_PROMPT = `You are a spot crypto accumulation analyst for long-term holders (hodlers). Return ONLY valid JSON, no extra text, no markdown fences.
Analyze the token's spot hodl potential based on: market cap tier, vol/mcap ratio, 7d/30d price momentum, whale concentration, wallet growth, exchange net outflow (negative = accumulation signal), social score, and ATH distance.
Favor tokens with: coins leaving exchanges, growing wallet count, healthy vol/mcap >0.1, positive momentum, and >30% below ATH (room to grow).
Penalize: very high whale concentration >60%, wallet base shrinking, social score <20, or less than 30 days old.
Reason field MUST be written in Spanish (max 12 words).
Return exactly this JSON: {"score":<0-100>,"type":"<accumulation|breakout|recovery|unknown>","signal":"<ACUMULAR|OBSERVAR|EVITAR>","reason":"<max 12 words in Spanish>","risk":"<LOW|MEDIUM|HIGH|EXTREME>","hodl_horizon":"<short|mid|long>"}`;

export const DEFAULT_MODEL = "claude-sonnet-4-6";