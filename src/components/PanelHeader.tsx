"use client";

import { COLORS } from "@/lib/constants";
import ExpandButton from "./ExpandButton";

const { MUTED } = COLORS;

interface PanelHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  isFocused: boolean;
  onToggleFocus: () => void;
}

export default function PanelHeader({
  title,
  subtitle,
  isFocused,
  onToggleFocus,
}: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <div className="panel-header-text">
        <div className="panel-header-title">{title}</div>
        {subtitle && (
          <div className="panel-header-subtitle">{subtitle}</div>
        )}
      </div>
      <ExpandButton expanded={isFocused} onClick={onToggleFocus} />
    </div>
  );
}