import React from "react";

interface DashRowProps {
  rowNumber: number;
  focus: string | null;
  setFocus: (panelId: string | null) => void;
  panels: Array<{
    id: string;
    render: (compact: boolean, onClickToFocus: () => void) => React.ReactNode;
  }>;
}

function DashRow({ rowNumber, focus, setFocus, panels }: DashRowProps) {
  const visible = panels.filter(Boolean);
  const single = visible.length === 1;

  // Cálculo dinámico de columnas (escalable a N paneles por fila)
  let cols: string;
  if (single) {
    cols = "1fr"; // regla 4: un solo panel ocupa 100%
  } else if (focus) {
    const focusIndex = visible.findIndex((p) => p.id === focus);
    // El panel enfocado ocupa 7fr, los demás se reparten el restante.
    // Para 2 paneles → "7fr 3fr" o "3fr 7fr"
    // Para 3 paneles → "7fr 1.5fr 1.5fr" (foco al inicio) etc.
    const otherWeight = (10 - 7) / (visible.length - 1);
    cols = visible
      .map((_, i) => (i === focusIndex ? "7fr" : `${otherWeight}fr`))
      .join(" ");
  } else {
    // Sin foco: distribución uniforme (50/50 con 2, 33/33/33 con 3, etc.)
    cols = visible.map(() => "1fr").join(" ");
  }

  return (
    <div
      className={`dash-row dash-row-${rowNumber} ${single ? "row-single" : ""}`}
      style={{ "--row-cols": cols } as React.CSSProperties}
    >
      {visible.map((panel) => {
        const isFocused = focus === panel.id;
        const isCompact = focus !== null && !isFocused;
        const onClickToFocus = () => setFocus(panel.id);
        return (
          <React.Fragment key={panel.id}>
            {panel.render(isCompact, onClickToFocus)}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default DashRow;