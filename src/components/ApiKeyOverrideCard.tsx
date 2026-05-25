"use client";

import { useEffect, useState } from "react";
import { COLORS } from "@/lib/constants";

const SS_KEY = "cpd_user_anthropic_key";

interface Props {
  // callback opcional para que el padre se entere de cambios (refrescar UI)
  onChange?: (key: string | null) => void;
}

/**
 * Tarjeta de configuración para usar una API key propia (BYO) en vez de la del
 * server. La key se guarda en sessionStorage (vida = mientras la pestaña esté
 * abierta) y se envía al endpoint /api/analyze como header `x-user-anthropic-key`.
 *
 * Si no hay key BYO configurada, la app usa la del `.env.local` del servidor.
 */
export default function ApiKeyOverrideCard({ onChange }: Props) {
  const { BG, BORDER, ACCENT, GREEN, MUTED, SUB } = COLORS;
  const [stored, setStored] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  // Hidratar desde sessionStorage al montar
  useEffect(() => {
    try {
      const v = window.sessionStorage.getItem(SS_KEY);
      setStored(v);
    } catch { /* silent */ }
  }, []);

  const save = () => {
    const trimmed = input.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      setError("La key debe empezar con 'sk-ant-'");
      return;
    }
    try {
      window.sessionStorage.setItem(SS_KEY, trimmed);
    } catch { /* silent */ }
    setStored(trimmed);
    setInput("");
    setError("");
    onChange?.(trimmed);
  };

  const clear = () => {
    try { window.sessionStorage.removeItem(SS_KEY); } catch { /* silent */ }
    setStored(null);
    setInput("");
    setError("");
    onChange?.(null);
  };

  return (
    <>
      <div
        style={{
          fontSize: 11,
          color: ACCENT,
          fontWeight: 600,
          fontFamily: "'Inter', sans-serif",
          marginBottom: 12,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        🔑 Override de Anthropic API key (BYO)
      </div>

      {stored ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 11,
                color: SUB,
                fontFamily: "'Inter', sans-serif",
                display: "block",
                marginBottom: 4,
              }}
            >
              Key activa (sessionStorage)
            </label>
            <div
              style={{
                background: BG,
                border: `1.5px solid ${BORDER}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                color: MUTED,
                fontFamily: "monospace",
                letterSpacing: 1,
              }}
            >
              {stored.slice(0, 14)}••••••••••••••
            </div>
          </div>
          <div
            style={{
              marginBottom: 10,
              padding: "7px 10px",
              background: GREEN + "12",
              border: `1px solid ${GREEN}33`,
              borderRadius: 7,
              fontSize: 10,
              color: GREEN,
              fontFamily: "'Inter', sans-serif",
              lineHeight: 1.5,
            }}
          >
            ✅ Override activo. Las llamadas a Claude usan <strong>esta</strong> key, ignorando la
            del servidor. Se borra al cerrar el navegador.
          </div>
          <button className="btn-s" onClick={clear} style={{ width: "100%" }}>
            🗑 Quitar override (volver a la key del server)
          </button>
        </>
      ) : (
        <>
          <div
            style={{
              padding: 10,
              background: BG,
              borderRadius: 8,
              fontSize: 10,
              color: SUB,
              fontFamily: "'Inter', sans-serif",
              lineHeight: 1.6,
              marginBottom: 10,
            }}
          >
            Por defecto la app usa la <code>ANTHROPIC_API_KEY</code> del{" "}
            <code>.env.local</code> del servidor. Si querés usar una key propia
            (ej. para limitar gastos a una sesión específica), pegala acá.
          </div>
          <div style={{ marginBottom: 10 }}>
            <input
              type="password"
              placeholder="sk-ant-api03-..."
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            {error && (
              <div
                style={{
                  fontSize: 10,
                  color: ACCENT,
                  marginTop: 5,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                ⚠ {error}
              </div>
            )}
          </div>
          <button
            className="btn-s"
            onClick={save}
            disabled={!input.startsWith("sk-")}
            style={{ width: "100%" }}
          >
            Activar override →
          </button>
        </>
      )}
    </>
  );
}
