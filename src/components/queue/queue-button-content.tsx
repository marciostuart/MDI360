import { Heart, Star, Ticket, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import type { QueueLayoutBlock } from "@/lib/queue/queue-layout";
import { queueButtonStyle } from "@/components/queue/queue-button-style";

const ICONS = {
  ticket: Ticket,
  user: UserRound,
  star: Star,
  heart: Heart,
} as const;

export function QueueButtonContent({
  block,
  children,
}: {
  block: QueueLayoutBlock;
  children: ReactNode;
}) {
  const Icon = block.icon && block.icon !== "none" ? ICONS[block.icon] : null;
  return (
    <span className="flex items-center justify-center gap-[0.4em]">
      {block.showIcon && Icon ? (
        <Icon aria-hidden="true" style={{ width: "1em", height: "1em", flex: "0 0 auto" }} />
      ) : null}
      <span className="min-w-0 overflow-hidden text-ellipsis">{children}</span>
    </span>
  );
}
