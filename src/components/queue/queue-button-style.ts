import type { CSSProperties } from "react";
import type { QueueLayoutBlock } from "@/lib/queue/queue-layout";

export function queueButtonStyle(block: QueueLayoutBlock): CSSProperties {
  return {
    background: block.buttonGradient
      ? `linear-gradient(${block.gradientAngle ?? 135}deg, ${block.gradientStartColor ?? block.backgroundColor}, ${block.gradientEndColor ?? block.backgroundColor})`
      : block.backgroundColor,
    borderRadius: `${block.borderRadius ?? 0.8}cqw`,
    padding: `${block.buttonPadding ?? 0.6}cqw`,
    textTransform: block.textCase === "uppercase" ? "uppercase" : "none",
  };
}
