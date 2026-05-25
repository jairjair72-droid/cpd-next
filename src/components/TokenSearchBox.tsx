"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COLORS } from "@/lib/constants";
import type { CandidateToken } from "@/lib/types";

interface Props {
  /** Pool sobre el que se hace match (solo se usa para las sugerencias). */
  candidates: CandidateToken[];
  /** Valor controlado del input. */
  value: string;
  /** Callback al cambiar el filtro. */
  onChange: (v: string) => void;
  /** Cuando true el input queda inactivo (scan en curso o sin datos). */
  disabled?: boolean;
  /** Cantidad de coincidencias actualmente visibles (para el contador). */
  matchCount?: number;
  /** Total de candidatos (para el contador "X/Y"). */
  totalCount?: number;
}

const MAX_SUGGESTIONS = 6;

export default function TokenSearchBox({
  candidates,
  value,
  onChange,
  disabled = false,
  matchCount,
  totalCount,
}: Props) {
  const { BG, CARD, BORDER, ACCENT, MUTED, SUB, TEXT } = COLORS;
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Prioriza matches al comienzo del símbolo, después contains en símbolo o nombre.
  const suggestions = useMemo(() => {
    const q = value.trim().toUpperCase();
    if (!q || !candidates.length) return [] as CandidateToken[];
    const starts: CandidateToken[] = [];
    const contains: CandidateToken[] = [];
    const seen = new Set<string>();
    for (const c of candidates) {
      if (seen.has(c.symbol)) continue;
      const sym = c.symbol.toUpperCase();
      const name = (c.name || "").toUpperCase();
      if (sym.startsWith(q)) {
        starts.push(c);
        seen.add(c.symbol);
      } else if (sym.includes(q) || name.includes(q)) {
        contains.push(c);
        seen.add(c.symbol);
      }
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [value, candidates]);

  // Cerrar el dropdown al hacer click afuera
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Si se desactiva (scan arranca o se vacía la lista), cerrar dropdown
  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setActiveIdx(-1);
    }
  }, [disabled]);

  const accept = (sym: string) => {
    onChange(sym);
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
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        e.preventDefault();
        accept(suggestions[activeIdx].symbol);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      if (open) setOpen(false);
      else if (value) onChange("");
    }
  };

  const showDropdown =
    open && !disabled && suggestions.length > 0 && value.trim().length > 0;

  const placeholder = disabled
    ? candidates.length === 0
      ? "Sin candidatos — ejecuta Descubrir"
      : "Escaneando..."
    : "Filtrar (ej: BTC, ADA, sol...)";

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", opacity: disabled ? 0.55 : 1 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: BG,
          border: `1.5px solid ${open && !disabled ? ACCENT + "88" : BORDER}`,
          borderRadius: 7,
          padding: "5px 9px",
          transition: "border .15s",
        }}
      >
        <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>🔎</span>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => !disabled && setOpen(true)}
          onKeyDown={onKey}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Filtrar candidatos por símbolo o nombre"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: TEXT,
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            padding: "2px 0",
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
        {value && !disabled && (
          <button
            onClick={() => {
              onChange("");
              setOpen(false);
              setActiveIdx(-1);
            }}
            aria-label="Limpiar filtro"
            style={{
              background: "transparent",
              border: "none",
              color: MUTED,
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        )}
        {typeof matchCount === "number" && typeof totalCount === "number" && totalCount > 0 && (
          <span
            style={{
              fontSize: 9,
              color: MUTED,
              fontFamily: "'Inter', sans-serif",
              flexShrink: 0,
              minWidth: 36,
              textAlign: "right",
            }}
          >
            {value ? `${matchCount}/${totalCount}` : `${totalCount}`}
          </span>
        )}
      </div>

      {showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 3px)",
            left: 0,
            right: 0,
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 7,
            boxShadow: "0 4px 14px #0001",
            zIndex: 30,
            overflow: "hidden",
          }}
        >
          {suggestions.map((s, i) => (
            <button
              key={s.symbol}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                // mousedown (no click) para que dispare antes del blur del input
                e.preventDefault();
                accept(s.symbol);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: i === activeIdx ? ACCENT + "11" : "transparent",
                border: "none",
                borderBottom: i < suggestions.length - 1 ? `1px solid ${BORDER}` : "none",
                cursor: "pointer",
                padding: "6px 10px",
                textAlign: "left",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {s.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.image}
                  alt=""
                  width={14}
                  height={14}
                  style={{ borderRadius: "50%" }}
                />
              )}
              <span style={{ fontWeight: 700, fontSize: 11, color: TEXT, minWidth: 50 }}>
                {highlightMatch(s.symbol, value)}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: SUB,
                  flex: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.name}
              </span>
              {typeof s.score === "number" && (
                <span style={{ fontSize: 9, color: MUTED, fontFamily: "monospace" }}>
                  {s.score}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Resalta la parte coincidente del símbolo en las sugerencias. */
function highlightMatch(symbol: string, query: string): React.ReactNode {
  const q = query.trim().toUpperCase();
  if (!q) return symbol;
  const sym = symbol.toUpperCase();
  const idx = sym.indexOf(q);
  if (idx === -1) return symbol;
  return (
    <>
      {symbol.slice(0, idx)}
      <span style={{ background: COLORS.ACCENT + "22", color: COLORS.ACCENT }}>
        {symbol.slice(idx, idx + q.length)}
      </span>
      {symbol.slice(idx + q.length)}
    </>
  );
}