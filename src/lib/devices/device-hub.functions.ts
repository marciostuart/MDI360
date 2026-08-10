import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { ScheduleRule } from "@/lib/schedules/rules";

const deviceIdSchema = z.object({
  deviceId: z.string().uuid(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
const operatingWindow = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

async function context(deviceId: string) {
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { requireUser } = await import("@/lib/auth/session.server");
  const { and, eq } = await import("drizzle-orm");
  const user = await requireUser();
  const row = (
    await getDb()
      .select()
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.id, deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      )
      .limit(1)
  )[0];
  if (!row) throw new Error("Tela não encontrada.");
  return { db: getDb(), schema, user, device: row };
}

export const getDeviceHub = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => deviceIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { db, schema, user, device } = await context(data.deviceId);
    const { asc, desc, eq, and, gte, lte } = await import("drizzle-orm");
    const playlists = await db
      .select({ id: schema.playlists.id, name: schema.playlists.name })
      .from(schema.playlists)
      .where(eq(schema.playlists.organizationId, user.organizationId))
      .orderBy(asc(schema.playlists.name));
    const schedules = await db
      .select({
        id: schema.schedules.id,
        playlistId: schema.schedules.playlistId,
        playlistName: schema.playlists.name,
        ruleType: schema.schedules.ruleType,
        ruleConfig: schema.schedules.ruleConfig,
        isActive: schema.schedules.isActive,
        createdAt: schema.schedules.createdAt,
      })
      .from(schema.schedules)
      .innerJoin(schema.playlists, eq(schema.playlists.id, schema.schedules.playlistId))
      .where(eq(schema.schedules.deviceId, device.id))
      .orderBy(desc(schema.schedules.createdAt));
    const reportFrom = data.from
      ? new Date(`${data.from}T00:00:00`)
      : new Date(Date.now() - 30 * 86400000);
    const reportTo = data.to ? new Date(`${data.to}T23:59:59.999`) : new Date();
    if (reportFrom > reportTo) throw new Error("A data inicial deve ser anterior à data final.");
    const playback = await db
      .select({
        id: schema.playbackEvents.id,
        startedAt: schema.playbackEvents.startedAt,
        durationMs: schema.playbackEvents.durationMs,
        playlistName: schema.playlists.name,
        mediaName: schema.mediaAssets.name,
        mediaKind: schema.mediaAssets.kind,
      })
      .from(schema.playbackEvents)
      .leftJoin(schema.playlists, eq(schema.playlists.id, schema.playbackEvents.playlistId))
      .leftJoin(schema.mediaAssets, eq(schema.mediaAssets.id, schema.playbackEvents.mediaAssetId))
      .where(
        and(
          eq(schema.playbackEvents.deviceId, device.id),
          gte(schema.playbackEvents.startedAt, reportFrom),
          lte(schema.playbackEvents.startedAt, reportTo),
        ),
      )
      .orderBy(desc(schema.playbackEvents.startedAt))
      .limit(5000);
    const organization = (
      await db
        .select({
          alertWhatsapp: schema.organizations.alertWhatsapp,
          alertWhatsappVerifiedAt: schema.organizations.alertWhatsappVerifiedAt,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, user.organizationId))
        .limit(1)
    )[0];
    return {
      device: {
        id: device.id,
        name: device.name,
        status: device.status,
        defaultPlaylistId: device.defaultPlaylistId,
        audioEnabled: device.audioEnabled,
        transitionEffect: device.transitionEffect,
        canvasPreset: device.canvasPreset,
        enabledModes: Array.isArray(device.enabledModes)
          ? (device.enabledModes as string[])
          : ["display"],
        screenWidth: device.screenWidth,
        screenHeight: device.screenHeight,
        appVersion: device.appVersion,
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        createdAt: device.createdAt.toISOString(),
        operatingHours:
          (device.operatingHours as Array<{
            weekdays: number[];
            startMinute: number;
            endMinute: number;
          }>) ?? [],
        offlineAlertsEnabled: device.offlineAlertsEnabled,
        recoveryAlertsEnabled: device.recoveryAlertsEnabled,
        offlineToleranceMinutes: device.offlineToleranceMinutes,
        alertWhatsapp: device.alertWhatsapp,
        alertWhatsappVerifiedAt: device.alertWhatsappVerifiedAt?.toISOString() ?? null,
      },
      online: Boolean(device.lastSeenAt && Date.now() - device.lastSeenAt.getTime() < 90000),
      playlists,
      schedules: schedules.map((item) => ({
        ...item,
        ruleConfig: item.ruleConfig as Omit<ScheduleRule, "type">,
        createdAt: item.createdAt.toISOString(),
      })),
      playback: playback.map((item) => ({ ...item, startedAt: item.startedAt.toISOString() })),
      organization: {
        alertWhatsapp: organization?.alertWhatsapp ?? null,
        alertWhatsappVerifiedAt: organization?.alertWhatsappVerifiedAt?.toISOString() ?? null,
      },
    };
  });

export const updateDeviceHub = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        defaultPlaylistId: z.string().uuid().nullable(),
        audioEnabled: z.boolean(),
        transitionEffect: z.enum(["none", "fade"]),
        // Optional for compatibility with a Studio tab that may still be open
        // with an older bundle. When omitted, Drizzle leaves the current modes
        // untouched instead of rejecting unrelated audio/transition changes.
        enabledModes: z
          .array(z.enum(["display", "issuer", "caller"]))
          .min(1)
          .max(3)
          .optional(),
        operatingHours: z.array(operatingWindow).max(14),
        offlineAlertsEnabled: z.boolean(),
        recoveryAlertsEnabled: z.boolean(),
        offlineToleranceMinutes: z.number().int().min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { db, schema, user } = await context(data.deviceId);
    const { and, eq } = await import("drizzle-orm");
    if (data.defaultPlaylistId) {
      const playlist = await db
        .select({ id: schema.playlists.id })
        .from(schema.playlists)
        .where(
          and(
            eq(schema.playlists.id, data.defaultPlaylistId),
            eq(schema.playlists.organizationId, user.organizationId),
          ),
        )
        .limit(1);
      if (!playlist[0]) throw new Error("Playlist inválida.");
    }
    const { deviceId, ...values } = data;
    await db
      .update(schema.devices)
      .set(values)
      .where(
        and(
          eq(schema.devices.id, deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      );
    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(deviceId);
    return { ok: true };
  });

const ruleSchema = z.object({
  type: z.enum([
    "date_time_range",
    "specific_date_time",
    "daily_time",
    "month_day",
    "weekdays",
    "month",
  ]),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  date: z.string().optional(),
  startMinute: z.number().int().min(0).max(1439).optional(),
  endMinute: z.number().int().min(1).max(1440).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  day: z.number().int().min(1).max(31).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

export const saveDeviceSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        scheduleId: z.string().uuid().optional(),
        playlistId: z.string().uuid(),
        rule: ruleSchema,
        isActive: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { db, schema, user } = await context(data.deviceId);
    const { and, eq } = await import("drizzle-orm");
    const owned = await db
      .select({ id: schema.playlists.id })
      .from(schema.playlists)
      .where(
        and(
          eq(schema.playlists.id, data.playlistId),
          eq(schema.playlists.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!owned[0]) throw new Error("Playlist inválida.");
    const { type, ...config } = data.rule;
    if (type === "date_time_range") {
      const from = data.rule.startAt ? new Date(data.rule.startAt) : null;
      const to = data.rule.endAt ? new Date(data.rule.endAt) : null;
      if (
        (!from && !to) ||
        (from && Number.isNaN(from.getTime())) ||
        (to && Number.isNaN(to.getTime())) ||
        (from && to && from >= to)
      )
        throw new Error("Informe uma data inicial e/ou final válida.");
    }
    if (
      type === "specific_date_time" &&
      (!data.rule.date || data.rule.startMinute === undefined || data.rule.endMinute === undefined)
    )
      throw new Error("Informe a data e os dois horários.");
    if (
      type === "daily_time" &&
      (data.rule.startMinute === undefined || data.rule.endMinute === undefined)
    )
      throw new Error("Informe o horário inicial e final.");
    if (
      type === "weekdays" &&
      (!data.rule.weekdays?.length ||
        data.rule.startMinute === undefined ||
        data.rule.endMinute === undefined)
    )
      throw new Error("Escolha ao menos um dia e os dois horários.");
    if (data.scheduleId)
      await db
        .update(schema.schedules)
        .set({
          playlistId: data.playlistId,
          ruleType: type,
          ruleConfig: config,
          isActive: data.isActive,
        })
        .where(
          and(
            eq(schema.schedules.id, data.scheduleId),
            eq(schema.schedules.deviceId, data.deviceId),
          ),
        );
    else
      await db.insert(schema.schedules).values({
        organizationId: user.organizationId,
        deviceId: data.deviceId,
        playlistId: data.playlistId,
        ruleType: type,
        ruleConfig: config,
        isActive: data.isActive,
      });
    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);
    return { ok: true };
  });

export const removeDeviceSchedule = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ deviceId: z.string().uuid(), scheduleId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { db, schema } = await context(data.deviceId);
    const { and, eq } = await import("drizzle-orm");
    await db
      .delete(schema.schedules)
      .where(
        and(eq(schema.schedules.id, data.scheduleId), eq(schema.schedules.deviceId, data.deviceId)),
      );
    return { ok: true };
  });

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export const sendWhatsappOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        phone: z.string().min(10).max(20),
        scope: z.enum(["organization", "device"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { db, schema, user } = await context(data.deviceId);
    const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
    const instance = process.env.EVOLUTION_API_INSTANCE;
    const key = process.env.EVOLUTION_API_KEY;
    if (!baseUrl || !instance || !key)
      throw new Error("WhatsApp ainda não foi configurado pelo suporte.");
    const { and, desc, eq } = await import("drizzle-orm");
    const phone = normalizePhone(data.phone);
    const last = (
      await db
        .select({ createdAt: schema.whatsappVerifications.createdAt })
        .from(schema.whatsappVerifications)
        .where(
          and(
            eq(schema.whatsappVerifications.organizationId, user.organizationId),
            eq(schema.whatsappVerifications.phone, phone),
          ),
        )
        .orderBy(desc(schema.whatsappVerifications.createdAt))
        .limit(1)
    )[0];
    if (last && Date.now() - last.createdAt.getTime() < 60000)
      throw new Error("Aguarde 60 segundos para reenviar o código.");
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    const { hash } = await import("bcryptjs");
    await db.insert(schema.whatsappVerifications).values({
      organizationId: user.organizationId,
      deviceId: data.scope === "device" ? data.deviceId : null,
      phone,
      codeHash: await hash(code, 10),
      expiresAt: new Date(Date.now() + 600000),
    });
    const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key },
      body: JSON.stringify({
        number: phone,
        text: `Seu código de confirmação MDI 360 é ${code}. Ele vale por 10 minutos.`,
      }),
    });
    if (!response.ok) throw new Error("Não foi possível enviar o código pelo WhatsApp.");
    return { ok: true, phone };
  });

export const verifyWhatsappOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        phone: z.string(),
        code: z.string().regex(/^\d{6}$/),
        scope: z.enum(["organization", "device"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { db, schema, user } = await context(data.deviceId);
    const { and, desc, eq, gt, isNull } = await import("drizzle-orm");
    const phone = normalizePhone(data.phone);
    const deviceCondition =
      data.scope === "device"
        ? eq(schema.whatsappVerifications.deviceId, data.deviceId)
        : isNull(schema.whatsappVerifications.deviceId);
    const row = (
      await db
        .select()
        .from(schema.whatsappVerifications)
        .where(
          and(
            eq(schema.whatsappVerifications.organizationId, user.organizationId),
            eq(schema.whatsappVerifications.phone, phone),
            deviceCondition,
            gt(schema.whatsappVerifications.expiresAt, new Date()),
            isNull(schema.whatsappVerifications.verifiedAt),
          ),
        )
        .orderBy(desc(schema.whatsappVerifications.createdAt))
        .limit(1)
    )[0];
    if (!row || row.attempts >= 5) throw new Error("Código expirado. Solicite um novo.");
    const { compare } = await import("bcryptjs");
    const valid = await compare(data.code, row.codeHash);
    if (!valid) {
      await db
        .update(schema.whatsappVerifications)
        .set({ attempts: row.attempts + 1 })
        .where(eq(schema.whatsappVerifications.id, row.id));
      throw new Error("Código incorreto.");
    }
    const now = new Date();
    await db
      .update(schema.whatsappVerifications)
      .set({ verifiedAt: now })
      .where(eq(schema.whatsappVerifications.id, row.id));
    if (data.scope === "device")
      await db
        .update(schema.devices)
        .set({ alertWhatsapp: phone, alertWhatsappVerifiedAt: now })
        .where(eq(schema.devices.id, data.deviceId));
    else
      await db
        .update(schema.organizations)
        .set({ alertWhatsapp: phone, alertWhatsappVerifiedAt: now })
        .where(eq(schema.organizations.id, user.organizationId));
    return { ok: true };
  });
