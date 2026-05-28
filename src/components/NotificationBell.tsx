"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS, SIG_COLOR } from "@/lib/constants";
import { relTime } from "@/lib/formatters";
import type {
  Alert,
  WatchlistAlert,
  TelegramSent,
  Signal,
} from "@/lib/types";

const { CARD, BORDER, MUTED, SUB, ACCENT, BG, TEXT, GREEN, ORANGE } = COLORS;

const tint = (c: string, pct: number) =>
  `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/** Tipo discriminado para mezclar los 3 tipos y ordenar por ts. */
type FeedItem =
  | { kind: "watch"; ts: number; data: WatchlistAlert }
  | { kind: "scan"; ts: number; data: Alert }
  | { kind: "tg"; ts: number; data: TelegramSent };

const TOTAL_LIMIT = 30;

interface Props {
  alerts: Alert[];
  watchAlerts: WatchlistAlert[];
  tgSentLog: TelegramSent[];
  lastReadTs: number;
  onMarkAllRead: () => void;
  /** Limpia todo (alerts + watchAlerts). Telegram se preserva. */
  onClearAll: () => void;
}

export default function NotificationBell({
  alerts,
  watchAlerts,
  tgSentLog,
  lastReadTs,
  onMarkAllRead,
  onClearAll,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [dropdownTop, setDropdownTop] = useState<number | null>(null);

  // Mezcla unificada ordenada por ts desc, cortada a TOTAL_LIMIT
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...watchAlerts.map((a) => ({ kind: "watch" as const, ts: a.ts, data: a })),
      ...alerts.map((a) => ({
        kind: "scan" as const,
        // Alert.id es un número (timestamp aproximado de cuando se creó)
        ts: typeof a.id === "number" ? a.id : Date.now(),
        data: a,
      })),
      ...tgSentLog.map((t) => ({ kind: "tg" as const, ts: t.ts, data: t })),
    ];
    items.sort((a, b) => b.ts - a.ts);
    return items.slice(0, TOTAL_LIMIT);
  }, [alerts, watchAlerts, tgSentLog]);

  // Sin leer = items con ts > lastReadTs
  const unread = useMemo(
    () => feed.filter((item) => item.ts > lastReadTs).length,
    [feed, lastReadTs],
  );

  // Agrupamos para mostrar por sección manteniendo orden dentro de cada grupo
  const watchItems = feed.filter((i) => i.kind === "watch");
  const scanItems = feed.filter((i) => i.kind === "scan");
  const tgItems = feed.filter((i) => i.kind === "tg");

  const totalSources = alerts.length + watchAlerts.length + tgSentLog.length;
  const showingAllOfRecent = feed.length >= totalSources;

  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Calcula la posición vertical del dropdown en mobile.
  // Se actualiza al abrir + al scrollear/redimensionar (para que el dropdown 
  // siga al botón aunque cambie de posición).
  useEffect(() => {
    if (!open) return;

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (!isMobile) {
      setDropdownTop(null);
      return;
    }

    const updatePosition = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      // Top del dropdown = bottom del botón + 8px de respiro
      setDropdownTop(rect.bottom + 8);
    };

    updatePosition();

    // Recalcular en scroll y resize para que el dropdown siga al botón
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const toggle = () => {
    if (!open && unread > 0) onMarkAllRead();
    setOpen(!open);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={buttonRef} 
        onClick={toggle}
        aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ""}`}
        title={unread > 0 ? `${unread} eventos sin leer` : "Notificaciones"}
        style={{
          width: 34,
          height: 34,
          borderRadius: "50%",
          border: `1px solid ${BORDER}`,
          background: BG,
          cursor: "pointer",
          fontSize: 15,
          lineHeight: 1,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          flexShrink: 0,
          transition: "border-color .2s",
        }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              background: ACCENT,
              color: "#fff",
              fontSize: 8,
              fontWeight: 700,
              fontFamily: "'Inter', sans-serif",
              borderRadius: 9,
              minWidth: 15,
              height: 15,
              padding: "0 4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${BG}`,
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="notification-dropdown"
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            zIndex: 30,
            overflow: "hidden",
            fontFamily: "'Inter', sans-serif",
            // En mobile: top dinámico calculado desde la posición real del botón.
            // En desktop: dropdownTop es null y CSS toma control.
            ...(dropdownTop !== null ? { top: dropdownTop } : {}),
          }}
        >
          {/* Header del dropdown */}
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${BORDER}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: TEXT,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                🔔 Notificaciones
              </div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
                {feed.length === 0
                  ? "Sin eventos"
                  : `${feed.length} recientes · último ${relTime(feed[0].ts)}`}
              </div>
            </div>
            {(watchAlerts.length > 0 || alerts.length > 0) && (
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm("¿Vaciar alertas? (los envíos de Telegram se preservan)")) {
                    onClearAll();
                    setOpen(false);
                  }
                }}
                style={{ fontSize: 9 }}
              >
                Vaciar
              </button>
            )}
          </div>

          {/* Cuerpo con scroll */}
          <div
            style={{
              maxHeight: 460,
              overflowY: "auto",
              padding: 8,
            }}
          >
            {feed.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {watchItems.length > 0 && (
                  <Section title="⚡ Alertas de watchlist" count={watchItems.length}>
                    {watchItems.map((item) => (
                      <WatchRow key={`w-${item.data.id}`} a={item.data} />
                    ))}
                  </Section>
                )}

                {scanItems.length > 0 && (
                  <Section title="🔔 Alertas del escaneo" count={scanItems.length}>
                    {scanItems.map((item) => (
                      <ScanRow key={`s-${item.data.id}`} a={item.data} />
                    ))}
                  </Section>
                )}

                {tgItems.length > 0 && (
                  <Section title="📱 Telegram" count={tgItems.length}>
                    {tgItems.map((item, idx) => (
                      <TgRow key={`t-${item.ts}-${idx}`} t={item.data} />
                    ))}
                  </Section>
                )}
              </>
            )}
          </div>

          {!showingAllOfRecent && (
            <div
              style={{
                padding: "8px 12px",
                borderTop: `1px solid ${BORDER}`,
                fontSize: 9,
                color: SUB,
                textAlign: "center",
              }}
            >
              Mostrando {feed.length} de {totalSources} · ver todo en sus tabs
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        padding: "24px 12px",
        textAlign: "center",
        fontSize: 11,
        color: MUTED,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.5 }}>🔕</div>
      Sin eventos todavía.
      <br />
      <span style={{ fontSize: 10 }}>
        Aparecerán cuando ejecutes un escaneo o se disparen alertas.
      </span>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 9,
          color: MUTED,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          paddingBottom: 4,
          borderBottom: `1px solid ${BORDER}`,
          marginBottom: 6,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{title}</span>
        <span style={{ color: ACCENT, fontWeight: 700 }}>{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {children}
      </div>
    </div>
  );
}

function WatchRow({ a }: { a: WatchlistAlert }) {
  // Color según tipo de alerta de watchlist
  const typeColor =
    a.type === "threshold_score"
      ? GREEN
      : a.type === "threshold_signal"
        ? GREEN
        : a.type === "price_spike"
          ? ORANGE
          : ACCENT;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "6px 8px",
        background: BG,
        borderRadius: 6,
        borderLeft: `3px solid ${typeColor}`,
        fontSize: 11,
      }}
    >
      <span style={{ color: MUTED, fontSize: 9, minWidth: 50, flexShrink: 0 }}>
        {relTime(a.ts)}
      </span>
      <span
        style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          fontSize: 12,
          minWidth: 48,
          flexShrink: 0,
        }}
      >
        {a.symbol}
      </span>
      <span style={{ color: SUB, flex: 1, minWidth: 0, fontSize: 10 }}>
        {a.message}
      </span>
    </div>
  );
}

function ScanRow({ a }: { a: Alert }) {
  const sigCol = SIG_COLOR[a.signal as Signal] ?? MUTED;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "6px 8px",
        background: BG,
        borderRadius: 6,
        borderLeft: `3px solid ${sigCol}`,
        fontSize: 11,
        alignItems: "center",
      }}
    >
      <span style={{ color: MUTED, fontSize: 9, minWidth: 34, flexShrink: 0 }}>
        {a.time}
      </span>
      <span
        style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          fontSize: 12,
          minWidth: 48,
          flexShrink: 0,
        }}
      >
        {a.symbol}
      </span>
      <span
        style={{
          background: tint(sigCol, 12),
          color: sigCol,
          border: `1px solid ${tint(sigCol, 30)}`,
          borderRadius: 4,
          padding: "1px 5px",
          fontSize: 8,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {a.signal}
      </span>
      <span
        style={{
          fontSize: 9,
          color: MUTED,
          flexShrink: 0,
        }}
      >
        {a.score}
      </span>
      <span
        style={{
          fontSize: 10,
          color: SUB,
          flex: 1,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={a.reason}
      >
        {a.reason}
      </span>
    </div>
  );
}

function TgRow({ t }: { t: TelegramSent }) {
  const sigCol = SIG_COLOR[t.signal] ?? MUTED;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "6px 8px",
        background: BG,
        borderRadius: 6,
        borderLeft: `3px solid ${t.ok ? GREEN : ACCENT}`,
        fontSize: 11,
        alignItems: "center",
      }}
    >
      <span style={{ color: MUTED, fontSize: 9, minWidth: 34, flexShrink: 0 }}>
        {t.time}
      </span>
      <span style={{ fontSize: 11, flexShrink: 0 }}>{t.ok ? "✅" : "❌"}</span>
      <span
        style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          fontSize: 12,
          minWidth: 48,
          flexShrink: 0,
        }}
      >
        {t.symbol}
      </span>
      <span
        style={{
          background: tint(sigCol, 12),
          color: sigCol,
          border: `1px solid ${tint(sigCol, 30)}`,
          borderRadius: 4,
          padding: "1px 5px",
          fontSize: 8,
          fontWeight: 700,
        }}
      >
        {t.signal}
      </span>
      {!t.ok && (
        <span
          style={{
            fontSize: 9,
            color: ACCENT,
            fontStyle: "italic",
          }}
        >
          error
        </span>
      )}
    </div>
  );
}