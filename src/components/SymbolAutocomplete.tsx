"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS } from "@/lib/constants";
import { getAvailableSymbols, type SymbolEntry } from "@/lib/client/api";

const { BG, CARD, BORDER, ACCENT, MUTED, TEXT } = COLORS;

interface Props {
  /** Llamado cuando el usuario elige un símbolo del dropdown. */
  onSelect: (entry: SymbolEntry) => void;
  /** Símbolos a excluir (los que ya están en watchlist). */
  excludeSymbols?: Set<string>;
  /** Texto del placeholder. */
  placeholder?: string;
}

const MAX_SUGGESTIONS = 8;

/**
 * Input con autocompletado contra todos los pares USDT disponibles en Binance.
 * Carga el catálogo una vez al montar y filtra client-side.
 */
export default function SymbolAutocomplete({
  onSelect,
  excludeSymbols,
  placeholder = "Agregar token (ej: BTC, RNDR, PEPE...)",
}: Props) {
  const [allSymbols, setAllSymbols] = useState<SymbolEntry[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Cargar el catálogo una sola vez al montar
  useEffect(() => {
    let cancelled = false;
    getAvailableSymbols()
      .then((data) => {
        if (!cancelled) {
          setAllSymbols(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sugerencias filtradas
  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q || !allSymbols.length) return [];

    const starts: SymbolEntry[] = [];
    const contains: SymbolEntry[] = [];
    for (const s of allSymbols) {
      if (excludeSymbols?.has(s.symbol)) continue;
      if (s.symbol.startsWith(q)) starts.push(s);
      else if (s.symbol.includes(q)) contains.push(s);
      if (starts.length + contains.length >= MAX_SUGGESTIONS * 2) break;
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [query, allSymbols, excludeSymbols]);

  // Cerrar al hacer click afuera
  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const accept = (s: SymbolEntry) => {
    onSelect(s);
    setQuery("");
    setOpen(false);
    setActiveIdx(-1);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        accept(suggestions[activeIdx]);
      } else if (suggestions.length === 1) {
        accept(suggestions[0]);
      } else if (suggestions.length > 0) {
        accept(suggestions[0]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const showDropdown = open && suggestions.length > 0 && query.trim().length > 0;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: BG,
          border: `1.5px solid ${open ? ACCENT : BORDER}`,
          borderRadius: 7,
          padding: "5px 9px",
          transition: "border .15s",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>+</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => !loading && setOpen(true)}
          onKeyDown={onKey}
          disabled={loading || !!error}
          placeholder={
            loading
              ? "Cargando símbolos..."
              : error
                ? `Error: ${error}`
                : placeholder
          }
          aria-label="Agregar token a la watchlist"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: TEXT,
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            padding: "2px 0",
          }}
        />
        {!loading && !error && allSymbols.length > 0 && (
          <span
            style={{
              fontSize: 9,
              color: MUTED,
              fontFamily: "'Inter', sans-serif",
              flexShrink: 0,
            }}
          >
            {allSymbols.length} disponibles
          </span>
        )}
      </div>

      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 7,
            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
            zIndex: 30,
            overflow: "hidden",
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.binanceSymbol}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background:
                  i === activeIdx
                    ? `color-mix(in srgb, ${ACCENT} 10%, transparent)`
                    : "transparent",
                border: "none",
                borderBottom:
                  i < suggestions.length - 1 ? `1px solid ${BORDER}` : "none",
                cursor: "pointer",
                padding: "7px 12px",
                textAlign: "left",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  color: TEXT,
                  minWidth: 60,
                  fontFamily: "'Playfair Display', serif",
                }}
              >
                {highlightMatch(s.symbol, query)}
              </span>
              <span style={{ fontSize: 10, color: MUTED, flex: 1 }}>
                {s.binanceSymbol}
              </span>
              <span style={{ fontSize: 9, color: ACCENT, fontWeight: 600 }}>
                ↵ agregar
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function highlightMatch(symbol: string, query: string): React.ReactNode {
  const q = query.trim().toUpperCase();
  if (!q) return symbol;
  const sym = symbol.toUpperCase();
  const idx = sym.indexOf(q);
  if (idx === -1) return symbol;
  return (
    <>
      {symbol.slice(0, idx)}
      <span
        style={{
          background: `color-mix(in srgb, ${ACCENT} 18%, transparent)`,
          color: ACCENT,
        }}
      >
        {symbol.slice(idx, idx + q.length)}
      </span>
      {symbol.slice(idx + q.length)}
    </>
  );
}