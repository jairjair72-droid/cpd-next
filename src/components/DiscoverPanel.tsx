"use client";

import { COLORS } from "@/lib/constants";
import type { CandidateToken, ScanLogEntry } from "@/lib/types";
import TokenSearchBox from "./TokenSearchBox";
import ExpandButton from "./ExpandButton";
import TokenCard from "./TokenCard";

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
        candidateCount={candidates.length}
        expanded={isFocused}
        onToggleExpand={onToggleFocus}
        rightSlot={
          <TokenSearchBox
            candidates={sortedAll}
            value={searchQuery}
            onChange={setSearchQuery}
            disabled={searchDisabled}
            matchCount={filtered.length}
            totalCount={sortedAll.length}
          />
        }
      />

      <div className="panel-inner panel-inner--split">
        {/* Columna izquierda: log del escaneo */}
        <div className="scroll-y" style={{ gap: 3 }}>
          {scanLog.length === 0 ? (
            <span
              style={{
                fontSize: 11,
                color: MUTED,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Esperando inicio...
            </span>
          ) : (
            [...scanLog].reverse().map((l, i) => (
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
            ))
          )}
        </div>

        {/* Columna derecha: lista de candidatos */}
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
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function PanelHeader({
  candidateCount,
  expanded,
  onToggleExpand,
  rightSlot,
}: {
  candidateCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 200px" }}>
        <div
          style={{
            fontSize: 10,
            color: MUTED,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          🔍 Descubrir — Última cacería
        </div>
        <div
          style={{
            fontSize: 10,
            color: MUTED,
            fontFamily: "'Inter', sans-serif",
            marginTop: 2,
          }}
        >
          {candidateCount
            ? `${candidateCount} candidatos encontrados · ordenados por score`
            : "Resultados del último scan en curso o ejecutado"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "flex-start",
          flex: "0 1 280px",
        }}
      >
        {rightSlot && <div style={{ flex: 1, minWidth: 160 }}>{rightSlot}</div>}
        <ExpandButton expanded={expanded} onClick={onToggleExpand} />
      </div>
    </div>
  );
}

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