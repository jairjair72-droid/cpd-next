# 🔴 Criminal Pump Detector — v2.5 (Next.js 16 + TypeScript) |

Detector de oportunidades crypto que combina **análisis técnico cuantitativo** (RVOL, BB Squeeze, RSI, Funding, OI) con **análisis fundamental de IA** vía Claude, sobre tokens de Binance Spot. Dashboard interactivo con sistema de paneles dinámicos, watchlist personal, forward-test de señales y narrativa IA anti-hype.

## ✨ Cambios principales desde v1 (Vite)

| Tema | v1 (Vite) | v2.5 (Next.js 16) |
|---|---|---|
| Bundler | Vite | Turbopack (stable, default en Next 16) |
| Lenguaje | JSX | TypeScript estricto |
| Backend | No tenía | API routes (`/app/api/*`) |
| API key de Anthropic | Browser (`anthropic-dangerous-direct-browser-access`) | Server-side + BYO opcional |
| CORS | A merced de cada API | Resuelto: todo pasa por el server |
| Fuente de mercado | CoinGecko | **CoinMarketCap** (CG como fallback) |
| Link CMC | Slug "adivinado" | Slug **real** desde la API |
| Persistencia | Solo memoria | **localStorage** completo |
| Métricas globales | "3.5T" hardcoded | Widget en vivo |
| Llamada a Claude | Espera completa | Toggle de streaming SSE |
| Layout | Tabs separadas | **Dashboard unificado con paneles dinámicos** |
| Watchlist | No existía | Panel completo con umbrales y alertas |
| Radar técnico | No existía | Forward-test 7d/14d/30d |
| Narrativa IA | No existía | Top 5 + resumen global con anti-hype |
| Tema visual | Solo claro | **Claro/oscuro** con CSS variables |

## 🚀 Setup

### Requisitos
- Node.js **20.9 o superior** (requerido por Next 16)
- npm (o pnpm / yarn / bun)

### Instalación

```bash
npm install
```

### Variables de entorno

Copiá `.env.example` a `.env.local` y completá:

```bash
cp .env.example .env.local
```

```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxx
CMC_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ANTHROPIC_MODEL=claude-sonnet-4-6
```

- **`ANTHROPIC_API_KEY`** — obtené tu key en [console.anthropic.com](https://console.anthropic.com)
- **`CMC_API_KEY`** — registrate en [pro.coinmarketcap.com](https://pro.coinmarketcap.com) (free tier sirve para empezar)

> ⚠️ Estas variables **NO** llevan prefijo `NEXT_PUBLIC_`, así viven sólo en el servidor.

### Desarrollo

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

### Build de producción

```bash
npm run build
npm start
```

## 🏗 Arquitectura

```
src/
├── app/
│   ├── api/                      ← BACKEND (Next.js Route Handlers)
│   │   ├── analyze/route.ts      ← POST → llama a Claude (oculta la key)
│   │   ├── narrate/route.ts      ← POST → narrativa IA anti-hype
│   │   ├── binance/
│   │   │   ├── tickers/          ← top tickers USDT con vol > $500k
│   │   │   ├── klines/           ← historial OHLCV de N símbolos
│   │   │   ├── futures/          ← funding rate + OI 24h
│   │   │   └── symbols/          ← lista de pares disponibles
│   │   ├── cmc/
│   │   │   ├── markets/          ← top 1000 desde CoinMarketCap
│   │   │   ├── global/           ← BTC dominance, total mcap
│   │   │   └── info/             ← metadata (logo, links)
│   │   ├── coingecko/markets/    ← fallback de CMC
│   │   ├── sentiment/fng/        ← Fear & Greed Index
│   │   └── telegram/             ← proxy del bot
│   ├── layout.tsx                ← script anti-flash de tema
│   ├── page.tsx
│   └── globals.css               ← CSS variables + .dash-panel + .panel-compact
├── components/
│   ├── App.tsx                   ← componente raíz con orquestación
│   ├── DiscoverPanel.tsx         ← panel de candidatos (escaneo)
│   ├── WatchlistPanel.tsx        ← panel de tokens en watch
│   ├── RadarPanel.tsx            ← panel de señales técnicas
│   ├── TelegramPanel.tsx         ← panel de stats del bot
│   ├── DashRow.tsx               ← gestiona el foco por fila (escalable a N)
│   ├── TokenCard.tsx             ← card del Discover
│   ├── NarrativeBanner.tsx       ← resumen global IA arriba del Dashboard
│   ├── NotificationBell.tsx      ← campanita unificada (3 fuentes)
│   ├── ApiStatusInline.tsx       ← status de APIs en panel de control
│   ├── ExpandButton.tsx          ← ⛶/✕ con feedback visual fuerte
│   ├── GlobalMetricsBar.tsx      ← widget de mercado global
│   ├── ApiKeyOverrideCard.tsx    ← BYO key opcional
│   ├── ThemeToggle.tsx           ← ☀️/🌙
│   ├── SymbolAutocomplete.tsx    ← input para agregar a Watchlist
│   ├── TokenSearchBox.tsx        ← filtro predictivo en Discover
│   ├── ScoreBadge.tsx
│   ├── Sparkline.tsx
│   └── DetailRow.tsx
└── lib/
    ├── types.ts                  ← tipos compartidos
    ├── constants.ts              ← colores, prompt, mapeos
    ├── formatters.ts             ← fmtUSD, fmtPct, relTime, etc.
    ├── indicators.ts             ← RSI, BB Squeeze, RVOL, divergencia
    ├── radar.ts                  ← scoring + forward-test + agreement
    ├── watchlist.ts              ← snapshots + deriveAlerts
    ├── narrative.ts              ← selección top 5 + cache fingerprint
    ├── server/                   ← código sólo del server
    │   ├── binance.ts
    │   ├── futures.ts
    │   ├── cmc.ts
    │   ├── coingecko.ts
    │   ├── sentiment.ts
    │   └── claude.ts             ← SDK oficial + streaming
    └── client/
        ├── api.ts                ← wrapper que el browser usa para /api/*
        └── storage.ts            ← hooks useLocalStorage / useSessionStorage
```

## 📊 Sistema de paneles dinámico

El Dashboard usa una arquitectura de **filas independientes con foco dinámico**:

- **2 filas × 2 paneles cada una:** Discover + Watchlist arriba, Radar + Telegram abajo
- **Estado de foco por fila:** cada fila tiene su propio panel activo (o ninguno)
- **Las filas no se afectan entre sí:** podés tener ambas filas con foco simultáneo
- **Sin foco:** los dos paneles de la fila están al 50/50
- **Con foco:** panel activo al 70%, hermano compactado al 30%
- **Hermano compactado:** mantiene toda la info visible, pero pierde interactividad (`pointer-events: none`)
- **Una sola fila con un panel:** ocupa 100% (regla 4, futuro-proof)

El estado se gestiona con un `Record<number, string | null>` dinámico — escalable a N filas sin tocar `App.tsx`.

### Patrón estructural común a los 4 paneles

```
.dash-panel (clase común)
  └── PanelHeader (subcomponente local con título + rightSlot + ExpandButton)
  └── .panel-inner (.panel-inner--single | .panel-inner--split)
       └── .scroll-y (lista scrollable con altura dinámica al hermano)
            └── Cards individuales con flex-shrink: 0
```

Cada panel exporta como `default`, define sus subcomponentes locales (`PanelHeader`, `EmptyState`, etc.) al final del archivo, y respeta el sistema de altura que iguala los paneles de la misma fila.

## 🎯 Módulo Radar — Señales técnicas

El **Radar es el Nivel 1 de detección**: análisis técnico cuantitativo sobre todos los tokens del escaneo, independiente del veredicto de Claude.

### Indicadores y pesos del score (100 puntos)

| Indicador | Peso | Qué mide |
|---|---|---|
| **RVOL** | 25 pts | Volumen actual vs SMA(20) — picos > 2× son señal |
| **BB Squeeze** | 15 pts | Compresión de Bollinger Bands — preludio de movimiento |
| **RSI + divergencia** | 20 pts | Sobreventa + divergencias alcistas |
| **Range position 90d** | 15 pts | Posición en el rango — preferimos lows |
| **Futures (funding + OI)** | 20 pts | Funding negativo + OI creciendo (redistribuible si no hay perpetuo) |
| **F&G modulator** | 5 pts | Comprar miedo, vender euforia |

### Forward-test en vivo
Cada señal generada guarda su precio de detección. En escaneos posteriores se actualizan los outcomes a **7d, 14d y 30d**. Después de 30 días la señal "cierra" y queda inmutable como caso histórico.

> ⚠️ Período de calentamiento honesto: outcomes válidos aparecen recién a los 7 días. Antes de eso, la app explícitamente dice "calentamiento" en lugar de mostrar estadísticas engañosas.

### Disenso visible con Claude
Cada señal del Radar se compara con el veredicto de Claude (`ACUMULAR` / `OBSERVAR` / `EVITAR`) y se clasifica:

- **AGREE** — ambos análisis coinciden ✓
- **DISAGREE_BULL** — técnicos alcistas, Claude EVITAR ⚠
- **DISAGREE_BEAR** — Claude positivo, técnicos débiles
- **NEUTRAL** — sin desacuerdo claro

El disenso es visible al expandir la card, con explicación contextual de qué significa.

## 👁️ Módulo Watchlist

Tokens personales que querés trackear **fuera del top N del Discover**:

- **Sin límite duro**, con aviso visual si superás 15 tokens (impacta costos de IA)
- **Snapshots históricos** por token en cada escaneo
- **Umbrales configurables** por token (score técnico mínimo, señal de Claude)
- **Alertas auto-generadas** vía `deriveAlerts` cuando se cruzan umbrales
- **Cards expandibles** con toda la info del Discover (mercado, suministro, históricos, IA, enlaces) + features propias (umbrales, notas, mini-historial de snapshots)
- **Botón 🗑 rápido** en el header de cada card para eliminar sin expandir

## 🧭 Narrativa IA anti-hype

Cada escaneo genera dos tipos de narrativa con prompts estrictos:

1. **Resumen global** (1 llamada) — banner arriba del Dashboard con el panorama del escaneo
2. **Narrativa individual top 5** (hasta 5 llamadas, con cache por fingerprint) — texto dentro de cada card del Radar marcadas con un chip 🧭 IA

### System prompts anti-promesa

Prohíben explícitamente:
- Predecir precios o prometer movimientos
- Palabras tipo "explosivo", "inminente", "garantizado", "luna"
- Inventar estadísticas "históricas" sin datos reales del forward-test
- Tono de influencer crypto

Promueven: tono sobrio, descriptivo, tipo terminal Bloomberg, con notas de incertidumbre cuando no hay datos de validación.

### Cache inteligente por fingerprint
Cada narrativa se asocia a un "fingerprint" de los indicadores (RVOL, RSI, BB Squeeze, etc. redondeados a propósito). Si los indicadores no cambiaron y la narrativa tiene menos de 6h, se reusa. Esto reduce ~5 llamadas fijas por escaneo a ~2-4 reales, sin perder frescura.

## 🔔 Notificación unificada

La campanita 🔔 del header agrupa **3 fuentes** ordenadas por timestamp:

- **⚡ Alertas de watchlist** — disparadas cuando un token cruza un umbral configurado
- **🔔 Alertas del escaneo** — generadas por Claude en cada Descubrir
- **📱 Telegram** — log de envíos (ok/error)

Mezcla las 3 fuentes, mostrando las 30 más recientes con badge de no-leídos. Botón "Vaciar" limpia alertas pero preserva el log de Telegram.

## 🎨 Sistema de temas (claro/oscuro)

Implementado con CSS variables. El default es claro (estética "papel envejecido"); el oscuro mantiene la paleta cálida (marrones oscuros, no negros puros). El toggle ☀️/🌙 está en el header.

**Anti-FOUC:** un script inline en `<head>` lee el tema guardado antes del primer paint, evitando el flash típico de tema oscuro al cargar.

## 🚢 Deploy a Vercel

```bash
npm install -g vercel
vercel
```

En el dashboard de Vercel, configurá las env vars (Project Settings → Environment Variables):

| Nombre | Tipo | Valor |
|---|---|---|
| `ANTHROPIC_API_KEY` | Encrypted | tu key |
| `CMC_API_KEY` | Encrypted | tu key |
| `ANTHROPIC_MODEL` | Plain | `claude-sonnet-4-6` |

> 💡 Las rutas `/api/analyze` y `/api/narrate` pueden tardar varios segundos por request. En el plan **Hobby** de Vercel hay un límite de 10s por function — si analizás >40 tokens, considerá `export const maxDuration = 60` y plan Pro.

## 🔐 Seguridad

- Las API keys viven **únicamente** en el servidor (nunca en el bundle del cliente)
- Las rutas `/api/*` no exponen mensajes de error del SDK con detalles sensibles (truncados a 200 chars)
- El `.gitignore` cubre `.env`, `.env.local`, `.env.*.local`
- BYO key se guarda en **sessionStorage** (se borra al cerrar el navegador)

### Si tu key fue expuesta

Si commiteaste o compartiste tu key, **rotala inmediatamente**:
1. Anthropic: [console.anthropic.com](https://console.anthropic.com) → API Keys → Revocar
2. CMC: [pro.coinmarketcap.com](https://pro.coinmarketcap.com/account) → Regenerate API Key

## 🛡️ Resiliencia: retry exponencial

El escaneo es robusto frente a errores transitorios:

- **3 intentos por token** con esperas de 1s / 3s / 8s
- **Errores transitorios** (529 overloaded, 5xx, red) → reintenta automáticamente
- **Errores permanentes** (400, 401, 403, 413) → aborta sin reintentar
- **Cada token falla individualmente** con `continue` — un token problemático no rompe el escaneo entero
- **La narrativa nunca rompe el flujo** — si falla, la narrativa no aparece pero el escaneo se completa

## 🧠 Notas técnicas

### CoinMarketCap como primaria
Antes la app usaba CoinGecko Demo (rate-limit feo) y el link a CMC se construía adivinando el slug — fallaba con nombres como `pump.fun` o `0x0.ai`. Ahora obtenemos el slug **real** desde la respuesta de CMC. Fallback automático a CoinGecko si CMC tira error.

### Caché en el servidor

| Endpoint | TTL | Por qué |
|---|---|---|
| `/api/binance/tickers` | 30s | precios cambian rápido |
| `/api/binance/klines` | 60s | velas diarias |
| `/api/binance/futures` | 60s | funding + OI |
| `/api/cmc/markets` | 120s | ahorrar créditos CMC |
| `/api/cmc/global` | 300s | dominancia se mueve lento |
| `/api/cmc/info` | 1h | logos/links no cambian |
| `/api/sentiment/fng` | 1h | F&G se actualiza diariamente |

### CMC: costo en créditos
`/v1/cryptocurrency/listings/latest?limit=1000` cuesta **5 créditos**. Con cache de 120s, hacer 30 escaneos en una hora cuesta ~150 créditos. El plan Free de CMC viene con 10k créditos/mes — sobra.

### Persistencia con localStorage
Estado que sobrevive recarga de página, todas las claves con prefijo `cpd_`:

- `cpd_candidates`, `cpd_alerts`, `cpd_history`
- `cpd_tg_log`, `cpd_tg_token`, `cpd_tg_chat`
- `cpd_capital`, `cpd_autotrade`, `cpd_topn`, `cpd_streaming`
- `cpd_radar_signals`, `cpd_fng`
- `cpd_watchlist`, `cpd_watch_history`, `cpd_watch_alerts`
- `cpd_last_events_read`
- `cpd_narratives`, `cpd_global_narrative`

El hook `useLocalStorage` es SSR-safe: hidrata en el primer `useEffect` para evitar mismatch.

**Limpiar todo:** Ajustes → 💾 Datos guardados → Borrar todos los datos guardados.

> ⚠️ El bot token de Telegram queda en localStorage del browser. Es razonable porque sólo vos accedés a tu navegador, pero si compartís la máquina, considera no guardarlo o cerrar la pestaña al terminar.

### React 19.2
Next.js 16 viene con React 19.2 (View Transitions, `useEffectEvent`, `<Activity/>`). No usamos ninguno todavía, pero quedan disponibles para iterar.

### Streaming SSE (opcional)
En **Ajustes → ⚡ Streaming de análisis** podés activar el modo SSE. La ruta `/api/analyze?stream=1` devuelve `text/event-stream` con un evento por cada `text_delta` del modelo.

**Caveat de Vercel:** en plan Hobby el timeout duro es 10s por function. Para producción en Vercel con streaming activo, considerá plan Pro y `export const maxDuration = 60` en `src/app/api/analyze/route.ts`.

## ⚠️ Disclaimer

Herramienta educativa y experimental. Los análisis son simulaciones con datos de mercado reales pero **heurísticas hechas a mano** (whale concentration, exchange netflow, etc. son derivados aproximados, no on-chain reales). Las narrativas IA son descriptivas y explícitamente prohibidas de predecir movimientos. **No constituye asesoramiento financiero.**
