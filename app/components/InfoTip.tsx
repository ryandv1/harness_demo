import type { ReactNode } from "react";

// Lightweight, dependency-free tooltip. Reveals on hover AND keyboard focus
// (accessible). `placement` controls which edge the bubble anchors to so it
// never spills past a card edge — use "right" for right-aligned triggers.
export default function InfoTip({
  children,
  tip,
  placement = "left",
  className = "",
}: {
  children: ReactNode;
  tip: ReactNode;
  placement?: "left" | "right";
  className?: string;
}) {
  return (
    <span
      className={`infotip infotip--${placement} ${className}`.trim()}
      tabIndex={0}
      role="note"
    >
      {children}
      <span className="infotip-bubble" role="tooltip">
        {tip}
      </span>
    </span>
  );
}
