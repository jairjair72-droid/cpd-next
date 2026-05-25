# 🔴 Criminal Pump Detector — v2 (Next.js 16 + TypeScript)

Migración del detector original (Vite + React + JSX) a **Next.js 16** con **TypeScript**, **App Router**, **API routes** (backend), e integración con la API oficial de **CoinMarketCap**. Turbopack es el bundler default en Next 16, no requiere flags.

## ✨ Qué cambió respecto a v1

| Tema | v1 (Vite) | v2 (Next.js 16) |
|---|---|---|
| Bundler | Vite | Turbopack (stable, default) |
| Lenguaje | JSX | TypeScript estricto |
| Backend | No tenía | API routes (`/app/api/*`) |
| API key de Anthropic | Browser (`anthropic-dangerous-direct-browser-access`) | Server-side (`.env.local`) + BYO opcional |
| CORS | A merced de cada API | Resuelto: todo pasa por el server |
| Fuente de mercado | CoinGecko | **CoinMarketCap** (CG como fallback) |
| Link CMC | Slug "adivinado" del nombre | Slug **real** desde la API |
| Modelo IA | Hardcoded en el cliente | `process.env.ANTHROPIC_MODEL` |
| Persistencia | Solo en memoria (se perdía al refrescar) | **localStorage** (alerts, candidates, history, eventos, config) |
| Métricas globales | "3.5T" hardcoded | **Widget en vivo** desde `/api/cmc/global` |
| Llamada a Claude | Espera completa | Toggle de **streaming SSE** (request/response o por chunks) |
| Persistencia | Estado se perdía al recargar | **localStorage** para alerts/history/candidatos |
| Métricas globales | Hardcoded `3.5T` | Widget en vivo (BTC dom, total mcap, vol) |
| Override de key | Modal bloqueante | **BYO opcional** en Ajustes (sessionStorage) |
| Análisis IA | Solo request/response | **Modo streaming (SSE)** opcional |

## 🚀 Setup

### 1. Requisitos
- Node.js **20.9 o superior** (requerido por Next 16)
- npm (o pnpm / yarn / bun)

### 2. Instalación

```bash
npm install
```

### 3. Variables de entorno

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

### 4. Desarrollo

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

### 5. Build de producción

```bash
npm run build
npm start
```

## 🏗 Arquitectura

```
src/
├── app/
│   ├── api/                    ← BACKEND (Next.js Route Handlers)
│   │   ├── analyze/route.ts    ← POST → llama a Claude (oculta la key)
│   │   ├── binance/
│   │   │   ├── tickers/        ← GET → top tickers USDT con vol > $500k
│   │   │   └── klines/         ← POST → historial de N símbolos en paralelo
│   │   ├── cmc/
│   │   │   ├── markets/        ← GET → top 1000 desde CoinMarketCap
│   │   │   ├── global/         ← GET → BTC dominance, total mcap
│   │   │   └── info/           ← GET → metadata (logo, links)
│   │   ├── coingecko/markets/  ← fallback de CMC
│   │   └── telegram/           ← proxy del bot
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── App.tsx                 ← componente raíz con todo el estado
│   ├── TokenCard.tsx
│   ├── ScoreBadge.tsx
│   ├── Sparkline.tsx
│   ├── DetailRow.tsx
│   ├── Monitor.tsx             ← EventRow + ApiStatusBadge
│   ├── Panels.tsx              ← MonitorPanel + TelegramPanel
│   ├── GlobalMetricsBar.tsx    ← v2.1 — widget de mercado global
│   └── ApiKeyOverrideCard.tsx  ← v2.1 — BYO key opcional
└── lib/
    ├── types.ts                ← tipos compartidos
    ├── constants.ts            ← colores, prompt, mapeos
    ├── formatters.ts           ← fmtUSD, fmtPct, etc.
    ├── server/                 ← código que sólo corre en el server
    │   ├── binance.ts
    │   ├── cmc.ts
    │   ├── coingecko.ts
    │   └── claude.ts           ← SDK oficial + analyzeTokenStream
    └── client/
        ├── api.ts              ← wrapper que el browser usa para llamar a /api/*
        └── storage.ts          ← v2.1 — hooks useLocalStorage / useSessionStorage
```

### Flujo de un escaneo

```
[Browser]                          [Next.js Server]              [Internet]
   │                                     │                          │
   │  GET /api/binance/tickers           │                          │
   │ ──────────────────────────────────► │                          │
   │                                     │  GET api.binance.com     │
   │                                     │ ─────────────────────►   │
   │                                     │ ◄─── tickers JSON ─────  │
   │ ◄──── filtrados + ordenados ─────── │                          │
   │                                     │                          │
   │  GET /api/cmc/markets               │                          │
   │ ──────────────────────────────────► │                          │
   │                                     │  GET pro-api.cmc.com     │
   │                                     │  X-CMC_PRO_API_KEY: ***  │
   │                                     │ ─────────────────────►   │
   │ ◄──── top 1000 por mcap ─────────── │                          │
   │                                     │                          │
   │  POST /api/binance/klines           │                          │
   │  { symbols: [BTCUSDT, ETHUSDT,...]}│                          │
   │ ──────────────────────────────────► │                          │
   │                                     │  Promise.all(klines)     │
   │                                     │ ─────────────────────►   │
   │ ◄──── historial 30d ─────────────── │                          │
   │                                     │                          │
   │  POST /api/analyze                  │                          │
   │  (×N tokens)                        │                          │
   │ ──────────────────────────────────► │                          │
   │                                     │  Anthropic SDK           │
   │                                     │  process.env.KEY: ***    │
   │                                     │ ─────────────────────►   │
   │ ◄──── { score, signal, ... } ───── │                          │
```

## 🆕 Features v2.1

### Persistencia con localStorage
Estado que sobrevive recarga de página: `candidates`, `alerts`, `history`, `events`, `tgSentLog`, `tgToken`, `tgChat`, `capital`, `autoTrade`, `topN`, `useStreaming`. Cada uno con su clave (`cpd_*`). El hook `useLocalStorage` es SSR-safe: hidrata en el primer `useEffect` para evitar mismatch.

**Limpiar todo:** abrí DevTools → Application → Local Storage → borrá las claves con prefijo `cpd_`.

### Widget de mercado global (CoinMarketCap)
Barra fina entre el header y las tabs muestra:
- Cap. total del mercado crypto
- Volumen 24h global
- Dominancia BTC y ETH
- Cantidad de criptomonedas activas

Se refresca automáticamente cada 5 minutos. Si CMC tira error (sin créditos, key inválida), se oculta con un mensaje discreto.

### BYO API key (override opcional)
En **Ajustes → Override de Anthropic API key**, podés pegar una key propia. Se guarda en **sessionStorage** (se borra al cerrar el navegador) y se envía al servidor en el header `x-user-anthropic-key`. El servidor la valida (formato `sk-ant-*`) y la prefiere sobre la del `.env.local`.

Útil para: separar el gasto de testing del de producción, o darle a alguien la app sin compartirle tu key del server.

### Streaming de análisis (SSE)
En **Ajustes → Streaming de análisis** podés activar el modo SSE. La ruta `/api/analyze?stream=1` devuelve `text/event-stream` con un evento por cada `text_delta` del modelo. El cliente parsea los eventos y muestra "streaming..." en el log apenas Claude empieza a generar.

> ⚠️ **No usar en Vercel Hobby** — el plan Hobby tiene timeout de 10s por function. Si vas a streamear, configurá `export const maxDuration = 60` en `src/app/api/analyze/route.ts` y pasá a plan Pro.

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

> 💡 La ruta `/api/analyze` puede tardar varios segundos por request. En el plan **Hobby** de Vercel hay un límite de 10s por function — si analizás >40 tokens, evaluá pasar a Pro o reducir `topN`.

## 🔐 Seguridad

- Las API keys viven **únicamente** en el servidor (no en el bundle del cliente).
- Las rutas `/api/*` no exponen mensajes de error del SDK con detalles sensibles (están truncados a 200 chars).
- El `.gitignore` cubre `.env`, `.env.local`, `.env.*.local`.

### Si tu key fue expuesta

Si ya commiteaste o compartiste tu key, **rotala inmediatamente**:
1. Anthropic: [console.anthropic.com](https://console.anthropic.com) → API Keys → Revocar
2. CMC: [pro.coinmarketcap.com](https://pro.coinmarketcap.com/account) → Regenerate API Key

## 🧠 Notas técnicas

### CoinMarketCap como primaria
Antes la app usaba CoinGecko Demo (rate-limit feo) y el link a CMC se construía adivinando el slug desde el nombre — fallaba con nombres como `pump.fun` o `0x0.ai`. Ahora obtenemos el slug **real** desde la respuesta de CMC.

El fallback a CoinGecko sigue activo: si CMC tira error (sin crédito, sin key configurada, etc.), el cliente cae automáticamente a `/api/coingecko/markets`.

### Caché en el servidor
Cada route handler tiene su propio `next: { revalidate: N }`:

| Endpoint | TTL | Por qué |
|---|---|---|
| `/api/binance/tickers` | 30s | precios cambian rápido |
| `/api/binance/klines` | 60s | velas diarias, no urgente |
| `/api/cmc/markets` | 120s | ahorrar créditos CMC |
| `/api/cmc/global` | 300s | dominancia se mueve lento |
| `/api/cmc/info` | 1h | logos/links no cambian |

### CMC: costo en créditos
`/v1/cryptocurrency/listings/latest?limit=1000` cuesta **5 créditos** (1 por cada 200 cryptos). Con el cache de 120s, hacer 30 escaneos en una hora cuesta ~150 créditos. El plan Free de CMC viene con 10k créditos/mes, sobra.

### React 19.2
Next.js 16 viene con React 19.2 (View Transitions, `useEffectEvent`, `<Activity/>`). No uso ninguno de estos features todavía, pero quedan disponibles si querés iterar.

## ⚠️ Disclaimer

Herramienta educativa y experimental. Los análisis son simulaciones con datos de mercado reales pero **heurísticas hechas a mano** (whale concentration, exchange netflow, etc. son derivados, no on-chain reales). No constituye asesoramiento financiero.

## 🆕 Features avanzados

### Persistencia en localStorage
Todos los datos importantes sobreviven a un refresco de página (alerts, candidates, history, eventos, config de Telegram, top N, capital, modo streaming). El estado efímero (logs de scan en curso, progreso, errores temporales, estado de API badges) **no** se persiste a propósito — esos son de cada sesión.

> Para limpiar todo: **Ajustes → 💾 Datos guardados → Borrar todos los datos guardados**.

Las claves usadas en localStorage: `cpd_candidates`, `cpd_alerts`, `cpd_history`, `cpd_events`, `cpd_tg_log`, `cpd_tg_token`, `cpd_tg_chat`, `cpd_capital`, `cpd_autotrade`, `cpd_topn`, `cpd_streaming`.

> ⚠️ El bot token de Telegram queda en localStorage del browser. Es razonable porque sólo vos accedés a tu navegador, pero si compartís la máquina, considera no guardarlo o cerrar la pestaña al terminar.

### Métricas globales en vivo
Barra fina debajo del header que muestra desde CoinMarketCap: total market cap, volumen 24h, BTC/ETH dominance, número de cryptos activas. Se refresca cada 5 minutos automáticamente (con cache server-side de 300s para no quemar créditos).

### BYO API key (override)
Por defecto la app usa `ANTHROPIC_API_KEY` del `.env.local` del servidor. Si querés usar una key propia distinta (por ejemplo para limitar gastos a una sesión específica), entrá a **Ajustes → 🔑 Override de Anthropic API key** y pegala ahí.

Detalles:
- Se guarda en **sessionStorage** (se borra al cerrar la pestaña, no en localStorage)
- Se envía al endpoint en el header `x-user-anthropic-key`
- El servidor la valida (debe empezar con `sk-ant-`) y la usa para esa request
- Si no hay override, vuelve a usar la del `.env.local`

### Streaming SSE
Entrá a **Ajustes → ⚡ Streaming de análisis** y prendé el toggle. Cuando está activo:
- `runDiscover` llama a `/api/analyze?stream=1` por cada token
- El backend usa `messages.stream()` del SDK de Anthropic
- Cada chunk se va emitiendo como evento SSE (`data: { delta: "..." }\n\n`)
- Al terminar, evento final con el JSON parseado: `data: { done: true, analysis: {...} }`

**Caveat de Vercel:** en plan Hobby el timeout duro es 10s por function. Si tu modelo tarda >10s en una sola respuesta de streaming, se corta. Para producción en Vercel, considerá plan Pro y descomentar `export const maxDuration = 60;` en `src/app/api/analyze/route.ts`.

Para **update** (refresco de candidatos existentes) seguimos usando `analyze` no-streaming porque ya se ejecuta en paralelo con `Promise.all`; hacer N streams concurrentes presionaría el server sin beneficio visible para el usuario.
