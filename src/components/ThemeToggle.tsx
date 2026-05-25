"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "cpd_theme";

/**
 * Toggle de tema (claro / oscuro). Persiste en localStorage bajo `cpd_theme`.
 * El default es "light" (lo que pediste). El script anti-flash del layout.tsx
 * se encarga de aplicar el tema antes del primer render.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Hidratar: leemos lo que el script del head ya seteó en <html data-theme>
  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as Theme) || "light";
    setTheme(current);
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    // Aplicar al <html>
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* silent */
    }
  };

  // Hasta que hidratamos, renderizamos un placeholder neutro para evitar
  // mismatch de SSR. Es invisible para el usuario porque el script del head
  // ya aplicó el tema correcto.
  if (!mounted) {
    return (
      <button
        className="theme-toggle"
        aria-label="Cambiar tema"
        style={{ visibility: "hidden" }}
        type="button"
      >
        ☀️
      </button>
    );
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      title={theme === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      type="button"
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}