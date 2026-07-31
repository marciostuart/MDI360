import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";

export type QueueCallHistoryItem = { label: string; sectorName: string | null };

export type QueueCallPayload = {
  /** Unique per announcement: repeats change it, so the TV calls again. */
  id: string;
  label: string;
  sectorName: string | null;
  spokenText: string;
  /** Ready-made MP3 for players without a speech engine (Roku). */
  audioUrl: string;
  displaySeconds: number;
  calledAt: string;
  /** Chamadas anteriores (mais recente primeiro), exibidas ao lado da atual. */
  history: QueueCallHistoryItem[];
};

/**
 * Recent queue calls of a screen, oldest first. The player shows them one at a
 * time, respecting the configured display time of each one, so a burst of
 * sector calls becomes a queue instead of overlapping announcements.
 */
export async function recentQueueCalls(deviceId: string): Promise<QueueCallPayload[]> {
  const db = getDb();

  const panels = await db
    .select({
      id: schema.queuePanels.id,
      isEnabled: schema.queuePanels.isEnabled,
      displaySeconds: schema.queuePanels.displaySeconds,
    })
    .from(schema.queuePanels)
    .where(eq(schema.queuePanels.deviceId, deviceId))
    .limit(1);

  const panel = panels[0];
  if (!panel || !panel.isEnabled) return [];

  const maxQueued = 8;

  const calls = await db
    .select()
    .from(schema.queueCalls)
    .where(eq(schema.queueCalls.panelId, panel.id))
    .orderBy(desc(schema.queueCalls.calledAt))
    .limit(maxQueued);

  const seconds = Math.max(panel.displaySeconds, 5);
  // Wide enough to cover a queue that is still draining, narrow enough that a
  // screen that reloads does not replay calls from minutes ago.
  const window = (seconds * maxQueued + 15) * 1000;
  const now = Date.now();

  // `calls` vem do mais recente para o mais antigo: o historico de cada chamada
  // sao as que vieram logo antes dela.
  const fresh = calls.filter((call) => now - call.calledAt.getTime() <= window);

  return fresh
    .map((call, index) => ({
      id: `${call.id}:${call.repeatCount}`,
      label: call.label,
      sectorName: call.sectorName,
      spokenText: call.spokenText,
      audioUrl: `/api/public/player/announce?call=${call.id}&r=${call.repeatCount}`,
      displaySeconds: seconds,
      calledAt: call.calledAt.toISOString(),
      history: calls
        .slice(index + 1)
        .filter((prev) => prev.label !== call.label)
        .slice(0, 4)
        .map((prev) => ({ label: prev.label, sectorName: prev.sectorName })),
    }))
    .reverse();
}
