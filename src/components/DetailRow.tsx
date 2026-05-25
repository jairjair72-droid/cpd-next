import { COLORS } from "@/lib/constants";

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  valueColor?: string;
}

export function DetailRow({ label, value, subtitle, valueColor }: DetailRowProps) {
  return (
    <div>
      <div style={{ fontSize: 9, color: COLORS.MUTED, marginBottom: 1, letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: valueColor ?? COLORS.SUB }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 9, color: COLORS.MUTED, marginTop: 1 }}>{subtitle}</div>
      )}
    </div>
  );
}

interface LinkBtnProps {
  href: string;
  children: React.ReactNode;
}

export function LinkBtn({ href, children }: LinkBtnProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "transparent",
        color: COLORS.ACCENT,
        border: `1px solid ${COLORS.ACCENT}55`,
        borderRadius: 6,
        padding: "4px 9px",
        fontSize: 10,
        fontWeight: 600,
        textDecoration: "none",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {children} ↗
    </a>
  );
}
