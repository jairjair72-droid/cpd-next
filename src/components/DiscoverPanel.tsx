"use client";

import { COLORS } from "@/lib/constants";
import { useEffect, useRef, useState } from "react";
import type { CandidateToken, ScanLogEntry } from "@/lib/types";
import TokenSearchBox from "./TokenSearchBox";
import ExpandButton from "./ExpandButton";
import TokenCard from "./TokenCard";
import PanelHeader from "@/components/PanelHeader";

const { MUTED, SUB, ACCENT, ORANGE, GREEN } = COLORS;

interface DiscoverPanelProps {
  cardStyle: React.CSSProperties;
  scanLog: ScanLogEntry[];
  candidates: CandidateToken[];
  scanning: boolean;
  expandedId: string | null;
  toggleExpand: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  sortedAll: CandidateToken[];
  filtered: CandidateToken[];
  searchDisabled: boolean;
  isFocused: boolean;
  onToggleFocus: () => void;
  compact: boolean;
}

export default function DiscoverPanel(props: DiscoverPanelProps) {
  const {
    cardStyle,
    scanLog,
    candidates,
    scanning,
    expandedId,
    toggleExpand,
    searchQuery,
    setSearchQuery,
    sortedAll,
    filtered,
    searchDisabled,
    isFocused,
    onToggleFocus,
    compact,
  } = props;

  // Estado: si el log está expandido en mobile (toggle del "Ver N más")
  const [logExpanded, setLogExpanded] = useState(false);
  const LOG_PREVIEW_COUNT = 10;

  return (
    <div
      className={`dash-panel panel-discover ${compact ? "panel-compact" : ""}`}
      style={{
        ...cardStyle,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <PanelHeader
        title="🔍 Descubrir — Última cacería"
        subtitle={
          candidates.length
            ? `${candidates.length} candidatos encontrados · ordenados por score`
            : "Resultados del último scan en curso o ejecutado"
        }
        isFocused={isFocused}
        onToggleFocus={onToggleFocus}
      />

      <div className="panel-inner panel-inner--split">
        {/* Columna izquierda: log */}
        <DiscoverLog
          scanLog={scanLog}
          logExpanded={logExpanded}
          setLogExpanded={setLogExpanded}
          previewCount={LOG_PREVIEW_COUNT}
        />

        {/* Columna derecha: encabezado de búsqueda + scroll de cards */}
        <div className="panel-tokens-column">
          <div className="panel-tokens-header">
            <TokenSearchBox
              candidates={sortedAll}
              value={searchQuery}
              onChange={setSearchQuery}
              disabled={searchDisabled}
              matchCount={filtered.length}
              totalCount={sortedAll.length}
            />
          </div>

          <div className="scroll-y">
            {candidates.length === 0 && !scanning ? (
              <DiscoverEmptyState />
            ) : candidates.length > 0 && filtered.length === 0 ? (
              <NoMatchesState
                searchQuery={searchQuery}
                onClear={() => setSearchQuery("")}
              />
            ) : (
              filtered.map((tok, idx) => {
                const cardId = `d-${tok.id}`;
                const podiumRank =
                  searchQuery.trim() === "" && idx < 3 ? idx + 1 : undefined;
                return (
                  <TokenCard
                    key={cardId}
                    tok={tok}
                    expanded={expandedId === cardId}
                    onToggle={() => {
                      if (compact) return;
                      toggleExpand(cardId);
                    }}
                    podiumRank={podiumRank}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function DiscoverEmptyState() {
  return (
    <div style={{ padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>📡</div>
      <p
        style={{
          color: MUTED,
          fontSize: 11,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Ejecuta descubrir para escanear Binance en tiempo real
      </p>
    </div>
  );
}

function NoMatchesState({
  searchQuery,
  onClear,
}: {
  searchQuery: string;
  onClear: () => void;
}) {
  return (
    <div style={{ padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>🤷</div>
      <p
        style={{
          color: MUTED,
          fontSize: 11,
          fontFamily: "'Inter', sans-serif",
          marginBottom: 8,
        }}
      >
        Sin coincidencias para <strong>&quot;{searchQuery}&quot;</strong>
      </p>
      <button
        className="btn-ghost"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
      >
        Limpiar filtro
      </button>
    </div>
  );
}

function DiscoverLog({
  scanLog,
  logExpanded,
  setLogExpanded,
  previewCount,
}: {
  scanLog: ScanLogEntry[];
  logExpanded: boolean;
  setLogExpanded: (v: boolean) => void;
  previewCount: number;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);    // ← NUEVO
  const reversedLog = [...scanLog].reverse();
  const hiddenCount = Math.max(0, reversedLog.length - previewCount);
  const visibleLog = logExpanded ? reversedLog : reversedLog.slice(0, previewCount);

  // Cuando se colapsa el log (Ver menos), resetear el scroll al inicio
  // para que la primera fila quede completamente visible
  useEffect(() => {
    if (!logExpanded && logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [logExpanded]);

  if (scanLog.length === 0) {
    return (
      <div className="scroll-y" style={{ gap: 3 }}>
        <span style={{ fontSize: 11, color: MUTED, fontFamily: "'Inter', sans-serif" }}>
          Esperando inicio...
        </span>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={logRef}                                       // ← NUEVO
        className={`scroll-y discover-log ${
          !logExpanded && hiddenCount > 0 ? "discover-log--collapsed" : ""
        }`}
        style={{ gap: 3 }}
      >
        {visibleLog.map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10,
              lineHeight: 1.6,
              flexShrink: 0,
              color:
                l.type === "hit"
                  ? GREEN
                  : l.type === "done"
                  ? ACCENT
                  : l.type === "warn"
                  ? ORANGE
                  : l.type === "skip"
                  ? MUTED
                  : SUB,
            }}
          >
            <span style={{ color: MUTED }}>{l.t} </span>
            {l.msg}
          </div>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          className="discover-log-toggle"
          onClick={() => setLogExpanded(!logExpanded)}
        >
          {logExpanded ? (
            <>
              <span>▴</span> Ver menos
            </>
          ) : (
            <>
              <span>▾</span> Ver {hiddenCount} más
            </>
          )}
        </button>
      )}
    </div>
  );
}