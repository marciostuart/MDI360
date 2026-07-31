import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";

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
};

/**
 * Latest queue call of a screen, or null when the add-on is off / nothing was
 * called yet. Rides along the normal /sync payload, which the push channel
 * already delivers in well under a second.
 */
export async function currentQueueCall(deviceId: string): Promise<QueueCallPayload | null> {
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
  if (!panel || !panel.isEnabled) return null;

  const calls = await db
    .select()
    .from(schema.queueCalls)
    .where(eq(schema.queueCalls.panelId, panel.id))
    .orderBy(desc(schema.queueCalls.calledAt))
    .limit(1);

  const call = calls[0];
  if (!call) return null;

  // Old calls must not interrupt playback after a screen reload.
  const age = Date.now() - call.calledAt.getTime();
  if (age > Math.max(panel.displaySeconds, 15) * 1000) return null;

  return {
    id: `${call.id}:${call.repeatCount}`,
    label: call.label,
    sectorName: call.sectorName,
    spokenText: call.spokenText,
    audioUrl: `/api/public/player/announce?call=${call.id}&r=${call.repeatCount}`,
    displaySeconds: panel.displaySeconds,
    calledAt: call.calledAt.toISOString(),
  };
}
