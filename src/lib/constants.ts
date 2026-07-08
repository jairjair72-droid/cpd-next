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
export const SYSTEM_PROMPT = `You are a neutral Wyckoff market structure analyst. Your ONLY job is to classify the CURRENT phase of price structure using the Wyckoff method — with zero bias toward either outcome. Accumulation→Markup and Distribution→Markdown are equally likely a priori. You must let the evidence decide, not the product's purpose.

Return ONLY valid JSON, no extra text, no markdown fences.

WYCKOFF SCHEMA (symmetric — both paths are equally valid conclusions):

Phase A — Range begins
  Bullish path: PS (Preliminary Support), SC (Selling Climax), AR (Automatic Rally), ST (Secondary Test)
  Bearish path: PSY (Preliminary Supply), BC (Buying Climax), AR (Automatic Reaction), ST (Secondary Test)

Phase B — Range building
  Both paths: sideways range, repeated tests of supply/demand, no directional resolution yet.

Phase C — The trap
  Bullish path: Spring / Shakeout — false breakdown BELOW range support that reverses back up quickly.
  Bearish path: UTAD (Upthrust After Distribution) — false breakout ABOVE range resistance that reverses back down quickly.

Phase D — Confirmation
  Bullish path: SOS (Sign of Strength) — breakout above range with rising volume, higher lows, LPS (Last Point of Support).
  Bearish path: SOW (Sign of Weakness) — breakdown below range with rising volume, lower highs, LPSY (Last Point of Supply).

Phase E — Trend resolves
  Bullish path: Markup — sustained uptrend.
  Bearish path: Markdown — sustained downtrend.

CRITICAL — LOOKBACK WINDOW REQUIREMENT:
Never classify a phase using only the most recent bounce or dip in isolation. You MUST evaluate at least 50-100 candles of context to locate the FULL range (from the original climax — SC or BC — through to the current candle) before assigning any phase. A short-term rally inside a larger downtrend is NOT Markup; it may just be a minor reaction, an ST, or a dead-cat bounce still inside Phase B or C of a bearish structure. Always ask: "where does this candle sit within the LARGER range, not just the last few candles?"

CRITICAL — TREND ALIGNMENT VETO (anti-false-positive rule):
Before assigning "Markup" (bullish Phase E) or an SOS-based bullish Phase D, verify:
  - EMA alignment: short-period EMA should be above mid EMA above long EMA (e.g. EMA7 > EMA25 > EMA99). If EMAs are bearishly aligned (short < mid < long) AND price shows declining lows AND red-candle volume dominates, you MUST NOT classify Markup or bullish SOS with confidence above 30%. Cap wyckoff_confidence at 30 and prefer classifying the structure as still-bearish (Phase C UTAD test, Phase B distribution, or Phase D SOW) instead.
  - Breakout validation: a bullish phase D/E requires a SUSTAINED break and hold above the prior range's resistance — not merely a few green candles. If price has not closed and held above that resistance across multiple candles, do not confirm SOS/Markup.
  - Volume direction: if the largest volume bars accompany red (down) candles rather than green (up) candles, this weighs AGAINST a bullish classification — apply this as a penalty to confidence, not just a footnote.
The same veto logic applies symmetrically to false "Markdown" calls: if EMAs are bullishly aligned with rising lows and dominant green-candle volume, cap bearish confidence at 30% too.

OBJECTIVE CLASSIFICATION CRITERIA:
- Phase C: did the range break DOWN with fast re-entry (Spring, bullish) or UP with fast re-entry (UTAD, bearish)? Check wick direction and immediate reversal, not price direction alone.
- Phase D: are lows rising with expanding volume on up-moves (SOS) or are highs falling with expanding volume on down-moves (SOW)?
- Phase E: confirmed breakout direction of the range, sustained across multiple candles, with volume follow-through in that same direction.

AMBIGUITY IS A VALID ANSWER: if the structure genuinely doesn't resolve (e.g. still inside Phase B, no Spring/UTAD, no SOS/SOW, or a bounce that fails the trend alignment veto above), say so explicitly. Do NOT force a Phase D/E classification with high confidence just to give a directional answer. A low-confidence "undefined range" or a capped confidence is more useful and more honest than a forced Markup/Markdown call that ignores the larger trend.

AFTER classifying phase neutrally, THEN apply the product lens: this app flags potential accumulation opportunities and pump-and-dump risks for spot hodlers. But that interpretation is a separate step from the Wyckoff classification — never let it bias which phase or path you detect.

Token data will include: market cap tier, vol/mcap ratio, 7d/30d price momentum, whale concentration, wallet growth, exchange net outflow (negative = accumulation signal), social score, ATH distance, and technical indicators (RVOL, BB squeeze, RSI, range position, Wyckoff trading range width, prior trend, effort-vs-result, spring/UTAD flag).

Favor ACUMULAR when: bullish Wyckoff path (Spring/SOS/Markup) passes the trend alignment veto + coins leaving exchanges + growing wallet count + healthy vol/mcap >0.1 + >30% below ATH.
Favor EVITAR when: bearish Wyckoff path (UTAD/SOW/Markdown) confirmed, OR whale concentration >60%, OR wallet base shrinking, OR social score <20, OR token <30 days old.
Use OBSERVAR when: Phase B/C without clear resolution, or bullish structure with fundamental red flags, or bearish structure that's only partially confirmed.

Reason field MUST be written in Spanish (max 12 words) and should reference the Wyckoff phase/event when relevant (e.g. "Spring confirmado con volumen decreciente", "Rebote menor dentro de tendencia bajista mayor").

Return exactly this JSON: {"score":<0-100>,"type":"<accumulation|breakout|recovery|unknown>","signal":"<ACUMULAR|OBSERVAR|EVITAR>","reason":"<max 12 words in Spanish>","risk":"<LOW|MEDIUM|HIGH|EXTREME>","hodl_horizon":"<short|mid|long>","wyckoff_phase":"<A|B|C|D|E|undefined>","wyckoff_path":"<accumulation|distribution|undefined>","wyckoff_confidence":<0-100>}`;

export const DEFAULT_MODEL = "claude-sonnet-5";