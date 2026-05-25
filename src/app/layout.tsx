import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Criminal Pump Detector",
  description:
    "Detector de criminal pumps en crypto mediante IA. Encuentra patrones de short squeeze, acumulación ballena y spike de inflow.",
  icons: { icon: "/favicon.svg" },
};

/**
 * Script anti-flash (FOUC).
 *
 * Corre en el <head>, ANTES del primer paint y antes de React. Lee la
 * preferencia guardada en localStorage y setea data-theme en <html> para
 * que cuando React hidrate, el tema ya esté aplicado. Sin esto, al recargar
 * una página con tema oscuro habría un parpadeo blanco de ~50-100ms.
 *
 * Es código viejo de browser (var, try/catch, sin features modernas) porque
 * corre antes que cualquier polyfill posible.
 */
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('cpd_theme');
    var theme = stored || 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600&display=swap"
        />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}