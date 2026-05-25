"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook estilo useState pero persistido en localStorage.
 *
 * Detalles importantes:
 * - SSR-safe: durante el primer render (server) devuelve `initialValue` para
 *   evitar mismatch de hidratación. Después, en el primer useEffect del cliente,
 *   hace lazy-load del valor real desde localStorage.
 * - Maneja JSON.parse/stringify automáticamente.
 * - Si querés borrar la clave, pasá `undefined` (no se persiste).
 * - Tolera datos corruptos: si JSON.parse falla, vuelve al initialValue.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(initialValue);
  const hydrated = useRef(false);

  // Hidratación (sólo cliente, una sola vez por key)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch (err) {
      console.warn(`useLocalStorage: no pude leer "${key}"`, err);
    } finally {
      hydrated.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persistencia (después de la hidratación inicial)
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn(`useLocalStorage: no pude escribir "${key}"`, err);
    }
  }, [key, value]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch { /* silent */ }
    setValue(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clear];
}

/** Versión para sessionStorage (no sobrevive al cierre del browser). */
export function useSessionStorage<T>(
  key: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(initialValue);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch { /* silent */ }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch { /* silent */ }
  }, [key, value]);

  const clear = useCallback(() => {
    try { window.sessionStorage.removeItem(key); } catch { /* silent */ }
    setValue(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, clear];
}
