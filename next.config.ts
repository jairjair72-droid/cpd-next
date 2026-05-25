import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // En Next.js 16 Turbopack es el bundler default. La sección `turbopack`
  // está vacía: usamos zero-config. La dejamos definida así queda explícito
  // y vos podés agregar resolveAlias / rules si más adelante hace falta.
  turbopack: {},
};

export default nextConfig;
