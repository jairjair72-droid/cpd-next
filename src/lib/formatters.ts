export function fmtUSD(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3)  return "$" + (n / 1e3).toFixed(2) + "K";
  if (n >= 1)    return "$" + n.toFixed(2);
  if (n > 0)     return "$" + n.toFixed(6);
  return "—";
}

export function fmtSupply(n: number | null | undefined, symbol: string): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B " + symbol;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M " + symbol;
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K " + symbol;
  return n.toLocaleString("es") + " " + symbol;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function fmtPrice(p: number | null | undefined): string {
  if (p == null || isNaN(p)) return "—";
  if (p >= 1)    return "$" + p.toFixed(2);
  if (p >= 0.01) return "$" + p.toFixed(4);
  return "$" + p.toFixed(6);
}

export function relTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "ahora";
  if (diff < 60_000)     return "ahora";
  if (diff < 3_600_000)  return `hace ${Math.floor(diff/60_000)}min`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff/3_600_000)}h`;
  return `hace ${Math.floor(diff/86_400_000)}d`;
}
