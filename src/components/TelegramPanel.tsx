"use client";

import { COLORS } from "@/lib/constants";
import ExpandButton from "./ExpandButton";
import PanelHeader from "@/components/PanelHeader";
import type { Signal, TelegramSent } from "@/lib/types";

const { CARD, BG, BORDER, ACCENT, ORANGE, GREEN, MUTED } = COLORS;

interface Props {
  tgSentLog: TelegramSent[];
  tgConfigured: boolean;
  setTab: (t: string) => void;
  isFocused: boolean;
  onToggleFocus: () => void;
  compact: boolean;
}

export default function TelegramPanel({
  tgSentLog,
  tgConfigured,
  setTab,
  isFocused,
  onToggleFocus,
  compact,
}: Props) {
  const now = Date.now();
  const last24h = tgSentLog.filter((m) => now - m.ts < 86_400_000);
  const buyCount = last24h.filter((m) => m.signal === "ACUMULAR").length;
  const watchCount = last24h.filter((m) => m.signal === "OBSERVAR").length;
  const errorCount = last24h.filter((m) => !m.ok).length;

  return (
    <div
      className={`dash-panel panel-telegram ${compact ? "panel-compact" : ""}`}
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <PanelHeader
        title="📱 Telegram — Últimas 24 horas"
        subtitle={<ConfigurationBadge tgConfigured={tgConfigured} />}
        isFocused={isFocused}
        onToggleFocus={onToggleFocus}
      />

      {!tgConfigured ? (
        <NotConfiguredState onConfigure={() => setTab("ajustes")} />
      ) : last24h.length === 0 ? (
        <NoMessagesState />
      ) : (
        <div className="panel-inner panel-inner--single">
          <div className="panel-tokens-header">
            <StatsGrid
              sent={last24h.length}
              buyCount={buyCount}
              watchCount={watchCount}
              errorCount={errorCount}
            />
          </div>
          <RecentHistory messages={last24h} />
        </div>
      )}
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function ConfigurationBadge({ tgConfigured }: { tgConfigured: boolean }) {
  const color = tgConfigured ? GREEN : MUTED;
  return (
    <span
      style={{
        fontSize: 9,
        fontFamily: "'Inter', sans-serif",
        fontWeight: 600,
        color,
        background: color + "15",
        border: `1px solid ${color}33`,
        borderRadius: 5,
        padding: "2px 7px",
      }}
    >
      {tgConfigured ? "● Configurado" : "○ Sin configurar"}
    </span>
  );
}

function NotConfiguredState({ onConfigure }: { onConfigure: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "28px 12px" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📵</div>
      <p
        style={{
          fontSize: 12,
          color: MUTED,
          fontFamily: "'Inter', sans-serif",
          marginBottom: 12,
        }}
      >
        Bot de Telegram no configurado
      </p>
      <button
        className="btn-s"
        style={{ fontSize: 11 }}
        onClick={(e) => {
          e.stopPropagation();
          onConfigure();
        }}
      >
        Configurar en Ajustes →
      </button>
    </div>
  );
}

function NoMessagesState() {
  return (
    <div style={{ textAlign: "center", padding: "28px 12px" }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔕</div>
      <p
        style={{
          fontSize: 12,
          color: MUTED,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Sin notificaciones en las últimas 24 horas
      </p>
    </div>
  );
}

function StatsGrid({
  sent,
  buyCount,
  watchCount,
  errorCount,
}: {
  sent: number;
  buyCount: number;
  watchCount: number;
  errorCount: number;
}) {
  const stats = [
    ["Enviadas", sent, ACCENT, "📤"],
    ["ACUMULAR", buyCount, GREEN, "🟢"],
    ["OBSERVAR", watchCount, ORANGE, "🟡"],
    ["Errores", errorCount, MUTED, "⚠️"],
  ] as const;

  return (
    <div className="tg-stat-grid">
      {stats.map(([label, val, col, icon]) => (
        <StatCell key={label} label={label} val={val} col={col} icon={icon} />
      ))}
    </div>
  );
}

function StatCell({
  label,
  val,
  col,
  icon,
}: {
  label: string;
  val: number;
  col: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background: BG,
        borderRadius: 8,
        padding: "8px 10px",
        border: `1px solid ${BORDER}`,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 2 }}>{icon}</div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: col,
          fontFamily: "'Inter', sans-serif",
          lineHeight: 1,
        }}
      >
        {val}
      </div>
      <div
        style={{
          fontSize: 9,
          color: MUTED,
          fontFamily: "'Inter', sans-serif",
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function RecentHistory({ messages }: { messages: TelegramSent[] }) {
  return (
    <>
      <div
        style={{
          fontSize: 9,
          color: MUTED,
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 5,
        }}
      >
        Historial reciente
      </div>
      <div className="scroll-y" style={{ gap: 2 }}>
        {messages.map((m, i) => (
          <MessageRow key={i} m={m} />
        ))}
      </div>
    </>
  );
}

function MessageRow({ m }: { m: TelegramSent }) {
  const color = sigCol(m.signal);
  return (
    <div className="tg-msg-row">
      <span style={{ color: MUTED, minWidth: 34, fontSize: 9, flexShrink: 0 }}>
        {m.time}
      </span>
      <span
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 11,
          fontWeight: 700,
          minWidth: 48,
          flexShrink: 0,
        }}
      >
        {m.symbol}
      </span>
      <span
        style={{
          background: color + "18",
          color,
          border: `1px solid ${color}33`,
          borderRadius: 4,
          padding: "1px 5px",
          fontSize: 8,
          fontWeight: 700,
          fontFamily: "'Inter', sans-serif",
          flexShrink: 0,
        }}
      >
        {m.signal}
      </span>
      {m.ok ? (
        <span style={{ color: GREEN, fontSize: 10 }}>✅ Enviado</span>
      ) : (
        <span style={{ color: ACCENT, fontSize: 10 }}>❌ Error</span>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sigCol(s: Signal): string {
  return s === "ACUMULAR" ? GREEN : s === "OBSERVAR" ? ORANGE : MUTED;
}