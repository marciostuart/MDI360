import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { notifyDevice, notifyQueuePanel } from "@/lib/player/realtime.server";

export async function queueDeviceIds(panelId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ deviceId: schema.queuePanelDevices.deviceId })
    .from(schema.queuePanelDevices)
    .where(eq(schema.queuePanelDevices.panelId, panelId));
  return rows.map((row) => row.deviceId);
}

export async function notifyQueueDevices(panelId: string): Promise<void> {
  notifyQueuePanel(panelId);
  const ids = await queueDeviceIds(panelId);
  for (const deviceId of ids) notifyDevice(deviceId);
}

export async function notifyQueueForDevice(deviceId: string): Promise<void> {
  const link = await getDb()
    .select({ panelId: schema.queuePanelDevices.panelId })
    .from(schema.queuePanelDevices)
    .where(eq(schema.queuePanelDevices.deviceId, deviceId))
    .limit(1);
  if (link[0]) await notifyQueueDevices(link[0].panelId);
}
