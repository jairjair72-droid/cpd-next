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

  let cols: string;
  if (focus) {
    const focusIndex = visible.findIndex((p) => p.id === focus);
    const otherWeight = (10 - 7) / Math.max(1, visible.length - 1);
    cols = visible
      .map((_, i) => (i === focusIndex ? "7fr" : `${otherWeight}fr`))
      .join(" ");
  } else {
    cols = single ? "1fr 1fr" : visible.map(() => "1fr").join(" ");
  }

  return (
    <div
      className={`dash-row dash-row-${rowNumber}`}
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