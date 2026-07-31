import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Add-on config as the customer sees it in the Studio (one row per screen). */
export type QueuePanelSummary = {
  deviceId: string;
  deviceName: string;
  deviceOnline: boolean;
  panelId: string | null;
  isEnabled: boolean;
  mode: string;
  username: string | null;
  displaySeconds: number;
  sectorCount: number;
  lastCallLabel: string | null;
  lastCallAt: string | null;
};

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O usuário precisa de ao menos 3 caracteres")
  .max(40)
  .regex(/^[a-z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou underscore");

const passwordSchema = z.string().min(6, "A senha precisa de ao menos 6 caracteres").max(200);

/** Every screen of the caller's organization plus its queue add-on state. */
export const listQueuePanels = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; items: QueuePanelSummary[] }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return { configured: false, items: [] };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { desc, eq, sql } = await import("drizzle-orm");
    const { DEVICE_ONLINE_WINDOW_MS } = await import("@/lib/devices/devices.functions");
    const user = await requireUser();
    const db = getDb();
    const { toQueueError } = await import("@/lib/queue/queue-errors.server");

    try {
      const rows = await db
        .select({
          deviceId: schema.devices.id,
          deviceName: schema.devices.name,
          lastSeenAt: schema.devices.lastSeenAt,
          panelId: schema.queuePanels.id,
          isEnabled: schema.queuePanels.isEnabled,
          mode: schema.queuePanels.mode,
          username: schema.queuePanels.username,
          displaySeconds: schema.queuePanels.displaySeconds,
        })
        .from(schema.devices)
        .leftJoin(schema.queuePanels, eq(schema.queuePanels.deviceId, schema.devices.id))
        .where(eq(schema.devices.organizationId, user.organizationId))
        .orderBy(desc(schema.devices.createdAt))
        .limit(200);

      const panelIds = rows.map((r) => r.panelId).filter((id): id is string => Boolean(id));

      const sectorCounts = new Map<string, number>();
      const lastCalls = new Map<string, { label: string; at: string }>();
      if (panelIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        const sectors = await db
          .select({ panelId: schema.queueSectors.panelId, total: sql<number>`count(*)::int` })
          .from(schema.queueSectors)
          .where(inArray(schema.queueSectors.panelId, panelIds))
          .groupBy(schema.queueSectors.panelId);
        for (const row of sectors) sectorCounts.set(row.panelId, Number(row.total));

        const calls = await db
          .select({
            panelId: schema.queueCalls.panelId,
            label: schema.queueCalls.label,
            calledAt: schema.queueCalls.calledAt,
          })
          .from(schema.queueCalls)
          .where(inArray(schema.queueCalls.panelId, panelIds))
          .orderBy(desc(schema.queueCalls.calledAt))
          .limit(200);
        for (const call of calls) {
          if (!lastCalls.has(call.panelId)) {
            lastCalls.set(call.panelId, { label: call.label, at: call.calledAt.toISOString() });
          }
        }
      }

      const now = Date.now();
      return {
        configured: true,
        items: rows.map((row) => {
          const last = row.panelId ? lastCalls.get(row.panelId) : undefined;
          return {
            deviceId: row.deviceId,
            deviceName: row.deviceName,
            deviceOnline: row.lastSeenAt
              ? now - row.lastSeenAt.getTime() < DEVICE_ONLINE_WINDOW_MS
              : false,
            panelId: row.panelId ?? null,
            isEnabled: row.isEnabled ?? false,
            mode: row.mode ?? "sequential",
            username: row.username ?? null,
            displaySeconds: row.displaySeconds ?? 20,
            sectorCount: row.panelId ? (sectorCounts.get(row.panelId) ?? 0) : 0,
            lastCallLabel: last?.label ?? null,
            lastCallAt: last?.at ?? null,
          };
        }),
      };
    } catch (error) {
      throw toQueueError(error);
    }
  },
);

/**
 * Enables the add-on on one screen and creates/updates the operator login.
 * The screen must belong to the caller's organization.
 */
export const saveQueuePanel = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const result = z
      .object({
        deviceId: z.string().uuid(),
        username: usernameSchema,
        // An empty field means "keep the current password".
        password: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
          passwordSchema.optional(),
        ),
        mode: z.enum(["sequential", "sector"]).default("sequential"),
        displaySeconds: z.number().int().min(10).max(120).default(20),
      })
      .safeParse(input);
    if (!result.success) {
      // Readable message instead of the raw Zod issue list.
      throw new Error(result.error.issues.map((issue) => issue.message).join(" · "));
    }
    return result.data;
  })
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");

    const { requireUser } = await import("@/lib/auth/session.server");
    const { hashQueuePassword } = await import("@/lib/queue/queue-auth.server");
    const { and, eq, ne } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const owned = await db
      .select({ id: schema.devices.id })
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.id, data.deviceId),
          eq(schema.devices.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!owned[0]) throw new Error("Tela não encontrada.");

    const { toQueueError } = await import("@/lib/queue/queue-errors.server");
    try {
      const existing = await db
        .select({ id: schema.queuePanels.id })
        .from(schema.queuePanels)
        .where(eq(schema.queuePanels.deviceId, data.deviceId))
        .limit(1);

      const taken = await db
        .select({ id: schema.queuePanels.id })
        .from(schema.queuePanels)
        .where(
          existing[0]
            ? and(
                eq(schema.queuePanels.username, data.username),
                ne(schema.queuePanels.id, existing[0].id),
              )
            : eq(schema.queuePanels.username, data.username),
        )
        .limit(1);
      if (taken[0]) throw new Error("Este usuário já está em uso por outro painel.");

      if (existing[0]) {
        await db
          .update(schema.queuePanels)
          .set({
            username: data.username,
            mode: data.mode,
            displaySeconds: data.displaySeconds,
            isEnabled: true,
            ...(data.password ? { passwordHash: await hashQueuePassword(data.password) } : {}),
          })
          .where(eq(schema.queuePanels.id, existing[0].id));
      } else {
        if (!data.password) throw new Error("Defina uma senha para o operador.");
        await db.insert(schema.queuePanels).values({
          organizationId: user.organizationId,
          deviceId: data.deviceId,
          username: data.username,
          passwordHash: await hashQueuePassword(data.password),
          mode: data.mode,
          displaySeconds: data.displaySeconds,
        });
      }
    } catch (error) {
      throw toQueueError(error);
    }

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);
    return { ok: true };
  });

/** Turns the add-on off on a screen (keeps history, blocks the operator login). */
export const setQueuePanelEnabled = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ deviceId: z.string().uuid(), isEnabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, inArray } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const panels = await db
      .select({ id: schema.queuePanels.id })
      .from(schema.queuePanels)
      .where(
        and(
          eq(schema.queuePanels.deviceId, data.deviceId),
          eq(schema.queuePanels.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!panels[0]) throw new Error("Painel não encontrado.");

    await db
      .update(schema.queuePanels)
      .set({ isEnabled: data.isEnabled })
      .where(eq(schema.queuePanels.id, panels[0].id));

    if (!data.isEnabled) {
      // Kicks the operator out immediately.
      await db
        .delete(schema.queueSessions)
        .where(inArray(schema.queueSessions.panelId, [panels[0].id]));
    }

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);
    return { ok: true };
  });

/** Removes the add-on from a screen along with its sectors and history. */
export const deleteQueuePanel = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ deviceId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .delete(schema.queuePanels)
      .where(
        and(
          eq(schema.queuePanels.deviceId, data.deviceId),
          eq(schema.queuePanels.organizationId, user.organizationId),
        ),
      );

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);
    return { ok: true };
  });
