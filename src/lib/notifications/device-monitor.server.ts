import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { getDb, schema } from "@/lib/db/index.server";
import { getLocalParts } from "@/lib/schedules/rules";

type OperatingWindow = { weekdays: number[]; startMinute: number; endMinute: number };

function isOperatingNow(value: unknown, timezone: string, now: Date) {
  const windows = Array.isArray(value) ? (value as OperatingWindow[]) : [];
  if (!windows.length) return true;
  const local = getLocalParts(now, timezone);
  return windows.some((window) => {
    if (!window.weekdays?.includes(local.weekday)) return false;
    return window.startMinute <= window.endMinute
      ? local.minute >= window.startMinute && local.minute < window.endMinute
      : local.minute >= window.startMinute || local.minute < window.endMinute;
  });
}

async function sendText(phone: string, text: string) {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const instance = process.env.EVOLUTION_API_INSTANCE;
  const key = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !instance || !key) throw new Error("Evolution API não configurada");
  const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!response.ok) throw new Error(`Evolution API respondeu ${response.status}`);
}

export async function monitorDeviceNotifications() {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      id: schema.devices.id,
      organizationId: schema.devices.organizationId,
      name: schema.devices.name,
      lastSeenAt: schema.devices.lastSeenAt,
      operatingHours: schema.devices.operatingHours,
      offlineAlertsEnabled: schema.devices.offlineAlertsEnabled,
      recoveryAlertsEnabled: schema.devices.recoveryAlertsEnabled,
      offlineToleranceMinutes: schema.devices.offlineToleranceMinutes,
      devicePhone: schema.devices.alertWhatsapp,
      devicePhoneVerifiedAt: schema.devices.alertWhatsappVerifiedAt,
      organizationPhone: schema.organizations.alertWhatsapp,
      organizationPhoneVerifiedAt: schema.organizations.alertWhatsappVerifiedAt,
      offlineAlertSentAt: schema.devices.offlineAlertSentAt,
      timezone: schema.locations.timezone,
    })
    .from(schema.devices)
    .innerJoin(schema.organizations, eq(schema.organizations.id, schema.devices.organizationId))
    .leftJoin(schema.locations, eq(schema.locations.id, schema.devices.locationId))
    .where(eq(schema.devices.status, "active"));

  let offlineSent = 0;
  let recoverySent = 0;
  let failures = 0;
  for (const row of rows) {
    if (!row.organizationId) continue;
    const phone = row.devicePhoneVerifiedAt
      ? row.devicePhone
      : row.organizationPhoneVerifiedAt
        ? row.organizationPhone
        : null;
    if (!phone) continue;
    const online = Boolean(row.lastSeenAt && now.getTime() - row.lastSeenAt.getTime() < 90000);
    if (online && row.offlineAlertSentAt) {
      const claimed = await db
        .update(schema.devices)
        .set({ offlineAlertSentAt: null })
        .where(and(eq(schema.devices.id, row.id), isNotNull(schema.devices.offlineAlertSentAt)))
        .returning({ id: schema.devices.id });
      if (!claimed[0]) continue;
      if (row.recoveryAlertsEnabled) {
        try {
          await sendText(phone, `✅ A TV “${row.name}” voltou a ficar online no MDI 360.`);
          await db.insert(schema.deviceNotificationLogs).values({
            organizationId: row.organizationId,
            deviceId: row.id,
            kind: "recovery",
            recipient: phone,
            status: "sent",
            sentAt: now,
          });
          recoverySent += 1;
        } catch (error) {
          await db
            .update(schema.devices)
            .set({ offlineAlertSentAt: row.offlineAlertSentAt })
            .where(and(eq(schema.devices.id, row.id), isNull(schema.devices.offlineAlertSentAt)));
          await db.insert(schema.deviceNotificationLogs).values({
            organizationId: row.organizationId,
            deviceId: row.id,
            kind: "recovery",
            recipient: phone,
            status: "failed",
            error: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida",
          });
          failures += 1;
          continue;
        }
      }
      continue;
    }
    if (online || !row.offlineAlertsEnabled || row.offlineAlertSentAt) continue;
    const cutoff = now.getTime() - row.offlineToleranceMinutes * 60000;
    if (row.lastSeenAt && row.lastSeenAt.getTime() > cutoff) continue;
    if (!isOperatingNow(row.operatingHours, row.timezone ?? "America/Sao_Paulo", now)) continue;
    const claimed = await db
      .update(schema.devices)
      .set({ offlineAlertSentAt: now })
      .where(and(eq(schema.devices.id, row.id), isNull(schema.devices.offlineAlertSentAt)))
      .returning({ id: schema.devices.id });
    if (!claimed[0]) continue;
    try {
      await sendText(
        phone,
        `⚠️ A TV “${row.name}” está offline há mais de ${row.offlineToleranceMinutes} minuto(s), dentro do horário de funcionamento.`,
      );
      await db.insert(schema.deviceNotificationLogs).values({
        organizationId: row.organizationId,
        deviceId: row.id,
        kind: "offline",
        recipient: phone,
        status: "sent",
        sentAt: now,
      });
      offlineSent += 1;
    } catch (error) {
      await db
        .update(schema.devices)
        .set({ offlineAlertSentAt: null })
        .where(eq(schema.devices.id, row.id));
      await db.insert(schema.deviceNotificationLogs).values({
        organizationId: row.organizationId,
        deviceId: row.id,
        kind: "offline",
        recipient: phone,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida",
      });
      failures += 1;
    }
  }
  return { checked: rows.length, offlineSent, recoverySent, failures };
}
