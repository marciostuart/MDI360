import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { notifyQueueCallDevice, notifyQueuePanel } from "@/lib/player/realtime.server";

export async function queueDeviceIds(panelId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ deviceId: schema.queuePanelDevices.deviceId })
    .from(schema.queuePanelDevices)
    .where(eq(schema.queuePanelDevices.panelId, panelId));
  return rows.map((row) => row.deviceId);
}

export function notifyQueueDevices(panelId: string, immediateDeviceId?: string): void {
  notifyQueuePanel(panelId);
  // Wake the terminal that initiated the call before waiting for the device
  // list query. Remaining screens are notified once the fan-out is loaded.
  if (immediateDeviceId) notifyQueueCallDevice(immediateDeviceId);
  void queueDeviceIds(panelId)
    .then((ids) => {
      for (const deviceId of ids) {
        if (deviceId !== immediateDeviceId) notifyQueueCallDevice(deviceId);
      }
    })
    .catch((error) => console.warn("[queue] device notification fan-out failed", error));
}

export async function notifyQueueForDevice(deviceId: string): Promise<void> {
  const link = await getDb()
    .select({ panelId: schema.queuePanelDevices.panelId })
    .from(schema.queuePanelDevices)
    .where(eq(schema.queuePanelDevices.deviceId, deviceId))
    .limit(1);
  if (link[0]) await notifyQueueDevices(link[0].panelId);
}
