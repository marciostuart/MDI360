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
  operatorCount: number;
  /** "sector" = sequência por setor · "global" = sequência única. */
  numberingScope: string;
  /** "priority" = preferenciais primeiro · "alternate" = intercalado. */
  priorityPolicy: string;
  priorityPrefix: string | null;
  /** Token da tela de emissão de senhas (totem). */
  kioskToken: string | null;
  emitterCode: string | null;
  /** Emissão liberada no terminal de emissão (/emitir). */
  issuingEnabled: boolean;
  lastCallLabel: string | null;
  lastCallAt: string | null;
  /** Aparência da chamada na TV. */
  themeBgColor: string;
  themeBgMediaId: string | null;
  themeTicketColor: string;
  themeTextColor: string;
  themeHistoryColor: string;
  /** Tom de chamada personalizado e volumes. */
  chimeName: string | null;
  chimeVolume: number;
  voiceVolume: number;
};

export const QUEUE_THEME_DEFAULTS = {
  themeBgColor: "#000000",
  themeBgMediaId: null as string | null,
  themeTicketColor: "#ffffff",
  themeTextColor: "#38bdf8",
  themeHistoryColor: "#ffffff",
};

export const QUEUE_SOUND_DEFAULTS = {
  chimeVolume: 55,
  voiceVolume: 200,
};

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB");

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O usuário precisa de ao menos 3 caracteres")
  .max(40)
  .regex(/^[a-z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou underscore");

const passwordSchema = z.string().min(6, "A senha precisa de ao menos 6 caracteres").max(200);

/** Throws when the caller's plan does not include the queue add-on. */
async function requireQueuePlan(organizationId: string) {
  const { getOrgLimits } = await import("@/lib/admin/limits.server");
  const limits = await getOrgLimits(organizationId);
  if (!limits.queueEnabled) {
    throw new Error("O sistema de senhas está disponível apenas nos planos pagos.");
  }
}

/** Every screen of the caller's organization plus its queue add-on state. */
export const listQueuePanels = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; available: boolean; items: QueuePanelSummary[] }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return { configured: false, available: false, items: [] };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { desc, eq, sql } = await import("drizzle-orm");
    const { DEVICE_ONLINE_WINDOW_MS } = await import("@/lib/devices/devices.functions");
    const user = await requireUser();
    const db = getDb();
    const { toQueueError } = await import("@/lib/queue/queue-errors.server");

    try {
      const { getOrgLimits } = await import("@/lib/admin/limits.server");
      const limits = await getOrgLimits(user.organizationId);
      if (!limits.queueEnabled) return { configured: true, available: false, items: [] };

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
          numberingScope: schema.queuePanels.numberingScope,
          priorityPolicy: schema.queuePanels.priorityPolicy,
          priorityPrefix: schema.queuePanels.priorityPrefix,
          kioskToken: schema.queuePanels.kioskToken,
          emitterCode: schema.queuePanels.emitterCode,
          issuingEnabled: schema.queuePanels.issuingEnabled,
          themeBgColor: schema.queuePanels.themeBgColor,
          themeBgMediaId: schema.queuePanels.themeBgMediaId,
          themeTicketColor: schema.queuePanels.themeTicketColor,
          themeTextColor: schema.queuePanels.themeTextColor,
          themeHistoryColor: schema.queuePanels.themeHistoryColor,
          chimeName: schema.queuePanels.chimeName,
          chimeVolume: schema.queuePanels.chimeVolume,
          voiceVolume: schema.queuePanels.voiceVolume,
        })
        .from(schema.devices)
        .leftJoin(schema.queuePanels, eq(schema.queuePanels.deviceId, schema.devices.id))
        .where(eq(schema.devices.organizationId, user.organizationId))
        .orderBy(desc(schema.devices.createdAt))
        .limit(200);

      const panelIds = rows.map((r) => r.panelId).filter((id): id is string => Boolean(id));

      const sectorCounts = new Map<string, number>();
      const operatorCounts = new Map<string, number>();
      const lastCalls = new Map<string, { label: string; at: string }>();
      if (panelIds.length > 0) {
        const { inArray } = await import("drizzle-orm");
        const sectors = await db
          .select({ panelId: schema.queueSectors.panelId, total: sql<number>`count(*)::int` })
          .from(schema.queueSectors)
          .where(inArray(schema.queueSectors.panelId, panelIds))
          .groupBy(schema.queueSectors.panelId);
        for (const row of sectors) sectorCounts.set(row.panelId, Number(row.total));

        const operators = await db
          .select({ panelId: schema.queueOperators.panelId, total: sql<number>`count(*)::int` })
          .from(schema.queueOperators)
          .where(inArray(schema.queueOperators.panelId, panelIds))
          .groupBy(schema.queueOperators.panelId);
        for (const row of operators) operatorCounts.set(row.panelId, Number(row.total));

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
        available: true,
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
            operatorCount: row.panelId ? (operatorCounts.get(row.panelId) ?? 0) : 0,
            numberingScope: row.numberingScope ?? "sector",
            priorityPolicy: row.priorityPolicy ?? "priority",
            priorityPrefix: row.priorityPrefix ?? null,
            kioskToken: row.kioskToken ?? null,
            emitterCode: row.emitterCode ?? null,
            issuingEnabled: row.issuingEnabled ?? true,
            lastCallLabel: last?.label ?? null,
            lastCallAt: last?.at ?? null,
            themeBgColor: row.themeBgColor ?? QUEUE_THEME_DEFAULTS.themeBgColor,
            themeBgMediaId: row.themeBgMediaId ?? null,
            themeTicketColor: row.themeTicketColor ?? QUEUE_THEME_DEFAULTS.themeTicketColor,
            themeTextColor: row.themeTextColor ?? QUEUE_THEME_DEFAULTS.themeTextColor,
            themeHistoryColor: row.themeHistoryColor ?? QUEUE_THEME_DEFAULTS.themeHistoryColor,
            chimeName: row.chimeName ?? null,
            chimeVolume: row.chimeVolume ?? QUEUE_SOUND_DEFAULTS.chimeVolume,
            voiceVolume: row.voiceVolume ?? QUEUE_SOUND_DEFAULTS.voiceVolume,
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
        numberingScope: z.enum(["sector", "global"]).default("sector"),
        priorityPolicy: z.enum(["priority", "alternate"]).default("priority"),
        priorityPrefix: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? null : value),
          z
            .string()
            .trim()
            .max(3)
            .regex(/^[A-Za-z0-9]*$/, "Use até 3 letras ou números no prefixo preferencial")
            .nullable()
            .default(null),
        ),
        displaySeconds: z.number().int().min(10).max(120).default(20),
        themeBgColor: hexColor.default(QUEUE_THEME_DEFAULTS.themeBgColor),
        themeBgMediaId: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? null : value),
          z.string().uuid().nullable().default(null),
        ),
        themeTicketColor: hexColor.default(QUEUE_THEME_DEFAULTS.themeTicketColor),
        themeTextColor: hexColor.default(QUEUE_THEME_DEFAULTS.themeTextColor),
        themeHistoryColor: hexColor.default(QUEUE_THEME_DEFAULTS.themeHistoryColor),
        chimeVolume: z.number().int().min(0).max(100).default(QUEUE_SOUND_DEFAULTS.chimeVolume),
        voiceVolume: z.number().int().min(0).max(300).default(QUEUE_SOUND_DEFAULTS.voiceVolume),
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

    await requireQueuePlan(user.organizationId);

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

    // Imagem de fundo precisa ser uma imagem pronta da própria organização.
    let bgMediaId: string | null = data.themeBgMediaId ?? null;
    if (bgMediaId) {
      const asset = await db
        .select({ id: schema.mediaAssets.id })
        .from(schema.mediaAssets)
        .where(
          and(
            eq(schema.mediaAssets.id, bgMediaId),
            eq(schema.mediaAssets.organizationId, user.organizationId),
            eq(schema.mediaAssets.kind, "image"),
          ),
        )
        .limit(1);
      if (!asset[0]) throw new Error("Imagem de fundo não encontrada na sua biblioteca.");
    }

    const configValues = {
      mode: data.mode,
      numberingScope: data.numberingScope,
      priorityPolicy: data.priorityPolicy,
      priorityPrefix: data.priorityPrefix ? data.priorityPrefix.toUpperCase() : null,
      displaySeconds: data.displaySeconds,
      chimeVolume: data.chimeVolume,
      voiceVolume: data.voiceVolume,
    };

    const themeValues = {
      themeBgColor: data.themeBgColor,
      themeBgMediaId: bgMediaId,
      themeTicketColor: data.themeTicketColor,
      themeTextColor: data.themeTextColor,
      themeHistoryColor: data.themeHistoryColor,
    };

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
            isEnabled: true,
            ...configValues,
            ...themeValues,
            ...(data.password ? { passwordHash: await hashQueuePassword(data.password) } : {}),
          })
          .where(eq(schema.queuePanels.id, existing[0].id));

        // Mantém o operador principal em sincronia com o acesso do painel.
        const { asc } = await import("drizzle-orm");
        const primary = await db
          .select({ id: schema.queueOperators.id })
          .from(schema.queueOperators)
          .where(eq(schema.queueOperators.panelId, existing[0].id))
          .orderBy(asc(schema.queueOperators.createdAt))
          .limit(1);
        if (primary[0]) {
          await db
            .update(schema.queueOperators)
            .set({
              username: data.username,
              isEnabled: true,
              ...(data.password ? { passwordHash: await hashQueuePassword(data.password) } : {}),
            })
            .where(eq(schema.queueOperators.id, primary[0].id));
        } else if (data.password) {
          await db.insert(schema.queueOperators).values({
            panelId: existing[0].id,
            name: "Operador principal",
            username: data.username,
            passwordHash: await hashQueuePassword(data.password),
          });
        }
      } else {
        if (!data.password) throw new Error("Defina uma senha para o operador.");
        const passwordHash = await hashQueuePassword(data.password);
        const { randomBytes } = await import("node:crypto");
        const created = await db
          .insert(schema.queuePanels)
          .values({
            organizationId: user.organizationId,
            deviceId: data.deviceId,
            username: data.username,
            passwordHash,
            kioskToken: randomBytes(16).toString("hex"),
            emitterCode: (await import("@/lib/queue/emitter-code.server")).newEmitterCode(),
            ...configValues,
            ...themeValues,
          })
          .returning({ id: schema.queuePanels.id });
        if (created[0]) {
          await db.insert(schema.queueOperators).values({
            panelId: created[0].id,
            name: "Operador principal",
            username: data.username,
            passwordHash,
          });
        }
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

    if (data.isEnabled) await requireQueuePlan(user.organizationId);

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

/* ------------------------------------------------------------------ */
/* Setores, operadores e totem — configuráveis SOMENTE pelo cliente     */
/* ------------------------------------------------------------------ */

export type QueueSectorRow = {
  id: string;
  name: string;
  prefix: string | null;
  lastNumber: number;
  /** Contador paralelo das preferenciais (P001...). */
  lastPriorityNumber: number;
  position: number;
  waitingNormal: number;
  waitingPriority: number;
  /** Quantidade de senhas por dia (null = ilimitado) e quantas já saíram hoje. */
  dailyLimit: number | null;
  issuedToday: number;
  /** Fila liberada para emissão no terminal (/emitir). */
  issuingEnabled: boolean;
};

export type QueueOperatorRow = {
  id: string;
  name: string;
  username: string;
  isEnabled: boolean;
  /** Guichê/mesa deste operador ("Guichê 01"), exibido e falado na TV. */
  deskLabel: string | null;
  /** Vazio = pode chamar todos os setores. */
  sectorIds: string[];
};

/** Panel row of the caller's organization, or an error. */
async function requireOwnedPanel(panelId: string) {
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { requireUser } = await import("@/lib/auth/session.server");
  const { and, eq } = await import("drizzle-orm");
  const user = await requireUser();
  const rows = await getDb()
    .select()
    .from(schema.queuePanels)
    .where(
      and(
        eq(schema.queuePanels.id, panelId),
        eq(schema.queuePanels.organizationId, user.organizationId),
      ),
    )
    .limit(1);
  const panel = rows[0];
  if (!panel) throw new Error("Painel de senhas não encontrado.");
  return panel;
}

/** Sectors and operators of one panel, for the Studio configuration screen. */
export const getQueuePanelDetails = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ panelId: z.string().uuid() }).parse(input))
  .handler(
    async ({
      data,
    }): Promise<{ sectors: QueueSectorRow[]; operators: QueueOperatorRow[] }> => {
      const { getDb, schema } = await import("@/lib/db/index.server");
      const { and, asc, eq, inArray, sql } = await import("drizzle-orm");
      const panel = await requireOwnedPanel(data.panelId);
      const db = getDb();

      const sectors = await db
        .select()
        .from(schema.queueSectors)
        .where(eq(schema.queueSectors.panelId, panel.id))
        .orderBy(asc(schema.queueSectors.position));

      const waitingRows = await db
        .select({
          sectorId: schema.queueTickets.sectorId,
          kind: schema.queueTickets.kind,
          total: sql<number>`count(*)::int`,
        })
        .from(schema.queueTickets)
        .where(
          and(eq(schema.queueTickets.panelId, panel.id), eq(schema.queueTickets.status, "waiting")),
        )
        .groupBy(schema.queueTickets.sectorId, schema.queueTickets.kind);

      const waiting = new Map<string, { normal: number; priority: number }>();
      for (const row of waitingRows) {
        if (!row.sectorId) continue;
        const entry = waiting.get(row.sectorId) ?? { normal: 0, priority: 0 };
        if (row.kind === "priority") entry.priority += Number(row.total);
        else entry.normal += Number(row.total);
        waiting.set(row.sectorId, entry);
      }

      // Senhas emitidas hoje por fila, para mostrar o consumo do limite diário.
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { gte, ne } = await import("drizzle-orm");
      const todayRows = await db
        .select({
          sectorId: schema.queueTickets.sectorId,
          total: sql<number>`count(*)::int`,
        })
        .from(schema.queueTickets)
        .where(
          and(
            eq(schema.queueTickets.panelId, panel.id),
            ne(schema.queueTickets.status, "cancelled"),
            gte(schema.queueTickets.issuedAt, startOfDay),
          ),
        )
        .groupBy(schema.queueTickets.sectorId);
      const issuedToday = new Map<string, number>();
      for (const row of todayRows) {
        if (row.sectorId) issuedToday.set(row.sectorId, Number(row.total));
      }

      const operators = await db
        .select()
        .from(schema.queueOperators)
        .where(eq(schema.queueOperators.panelId, panel.id))
        .orderBy(asc(schema.queueOperators.createdAt));

      const links =
        operators.length > 0
          ? await db
              .select()
              .from(schema.queueOperatorSectors)
              .where(
                inArray(
                  schema.queueOperatorSectors.operatorId,
                  operators.map((o) => o.id),
                ),
              )
          : [];

      return {
        sectors: sectors.map((s) => ({
          id: s.id,
          name: s.name,
          prefix: s.prefix,
          lastNumber: s.lastNumber,
          lastPriorityNumber: s.lastPriorityNumber,
          position: s.position,
          waitingNormal: waiting.get(s.id)?.normal ?? 0,
          waitingPriority: waiting.get(s.id)?.priority ?? 0,
          dailyLimit: s.dailyLimit ?? null,
          issuedToday: issuedToday.get(s.id) ?? 0,
          issuingEnabled: s.issuingEnabled,
        })),
        operators: operators.map((o) => ({
          id: o.id,
          name: o.name,
          username: o.username,
          isEnabled: o.isEnabled,
          deskLabel: o.deskLabel ?? null,
          sectorIds: links.filter((l) => l.operatorId === o.id).map((l) => l.sectorId),
        })),
      };
    },
  );

export const saveQueueSector = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        panelId: z.string().uuid(),
        sectorId: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(40),
        prefix: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? null : value),
          z.string().trim().max(3).nullable().default(null),
        ),
        /** Quantidade de senhas por dia. `null` = ilimitado. */
        dailyLimit: z.preprocess(
          (value) =>
            value === "" || value === undefined || value === null ? null : Number(value),
          z.number().int().min(1).max(9999).nullable().default(null),
        ),
        /** Quando informado, redefine quais operadores podem chamar este setor. */
        operatorIds: z.array(z.string().uuid()).optional(),
        /** Quando informado, libera ou bloqueia a fila no terminal de emissão. */
        issuingEnabled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq, inArray, sql } = await import("drizzle-orm");
    const panel = await requireOwnedPanel(data.panelId);
    const db = getDb();
    const prefix = data.prefix ? data.prefix.toUpperCase() : null;

    let sectorId = data.sectorId ?? null;
    if (data.sectorId) {
      await db
        .update(schema.queueSectors)
        .set({
          name: data.name,
          prefix,
          dailyLimit: data.dailyLimit ?? null,
          ...(data.issuingEnabled === undefined ? {} : { issuingEnabled: data.issuingEnabled }),
        })
        .where(
          and(
            eq(schema.queueSectors.id, data.sectorId),
            eq(schema.queueSectors.panelId, panel.id),
          ),
        );
    } else {
      const next = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.queueSectors)
        .where(eq(schema.queueSectors.panelId, panel.id));
      const created = await db
        .insert(schema.queueSectors)
        .values({
          panelId: panel.id,
          name: data.name,
          prefix,
          dailyLimit: data.dailyLimit ?? null,
          position: Number(next[0]?.total ?? 0),
          ...(data.issuingEnabled === undefined ? {} : { issuingEnabled: data.issuingEnabled }),
        })
        .returning({ id: schema.queueSectors.id });
      sectorId = created[0]?.id ?? null;
    }

    // Acessos por setor: só operadores do próprio painel entram no vínculo.
    if (data.operatorIds && sectorId) {
      const validOperators =
        data.operatorIds.length > 0
          ? (
              await db
                .select({ id: schema.queueOperators.id })
                .from(schema.queueOperators)
                .where(
                  and(
                    eq(schema.queueOperators.panelId, panel.id),
                    inArray(schema.queueOperators.id, data.operatorIds),
                  ),
                )
            ).map((o) => o.id)
          : [];

      await db
        .delete(schema.queueOperatorSectors)
        .where(eq(schema.queueOperatorSectors.sectorId, sectorId));
      if (validOperators.length > 0) {
        await db
          .insert(schema.queueOperatorSectors)
          .values(validOperators.map((operatorId) => ({ operatorId, sectorId: sectorId! })));
      }
    }
    return { ok: true };
  });

export const deleteQueueSector = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ panelId: z.string().uuid(), sectorId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq } = await import("drizzle-orm");
    const panel = await requireOwnedPanel(data.panelId);
    await getDb()
      .delete(schema.queueSectors)
      .where(
        and(eq(schema.queueSectors.id, data.sectorId), eq(schema.queueSectors.panelId, panel.id)),
      );
    return { ok: true };
  });

/**
 * Libera ou bloqueia a emissão de senhas no terminal (/emitir). Sem `sectorId`
 * o controle é da tela inteira; com `sectorId` é daquela fila.
 */
export const setQueueIssuing = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        panelId: z.string().uuid(),
        sectorId: z.string().uuid().nullable().optional(),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq } = await import("drizzle-orm");
    const panel = await requireOwnedPanel(data.panelId);
    const db = getDb();

    if (data.sectorId) {
      await db
        .update(schema.queueSectors)
        .set({ issuingEnabled: data.enabled })
        .where(
          and(eq(schema.queueSectors.id, data.sectorId), eq(schema.queueSectors.panelId, panel.id)),
        );
    } else {
      await db
        .update(schema.queuePanels)
        .set({ issuingEnabled: data.enabled })
        .where(eq(schema.queuePanels.id, panel.id));
    }
    return { ok: true };
  });

/**
 * Zera contadores e descarta as senhas que ainda estavam aguardando. Com
 * `sectorId`, zera apenas aquela fila (o restante do painel continua igual).
 */
export const resetQueueCounters = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        panelId: z.string().uuid(),
        sectorId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq } = await import("drizzle-orm");
    const panel = await requireOwnedPanel(data.panelId);
    const db = getDb();

    if (data.sectorId) {
      await db
        .update(schema.queueSectors)
        .set({ lastNumber: 0, lastPriorityNumber: 0 })
        .where(
          and(
            eq(schema.queueSectors.id, data.sectorId),
            eq(schema.queueSectors.panelId, panel.id),
          ),
        );
      await db
        .update(schema.queueTickets)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(schema.queueTickets.panelId, panel.id),
            eq(schema.queueTickets.sectorId, data.sectorId),
            eq(schema.queueTickets.status, "waiting"),
          ),
        );
      return { ok: true };
    }

    await db
      .update(schema.queuePanels)
      .set({ lastNumber: 0, lastPriorityNumber: 0, lastCalledKind: "normal" })
      .where(eq(schema.queuePanels.id, panel.id));
    await db
      .update(schema.queueSectors)
      .set({ lastNumber: 0, lastPriorityNumber: 0 })
      .where(eq(schema.queueSectors.panelId, panel.id));
    await db
      .update(schema.queueTickets)
      .set({ status: "cancelled" })
      .where(
        and(eq(schema.queueTickets.panelId, panel.id), eq(schema.queueTickets.status, "waiting")),
      );
    return { ok: true };
  });

export const saveQueueOperator = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const result = z
      .object({
        panelId: z.string().uuid(),
        operatorId: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(60),
        username: usernameSchema,
        /** Guichê/mesa mostrado e falado na TV ("Guichê 01"). */
        deskLabel: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? null : value),
          z.string().trim().max(40).nullable().default(null),
        ),
        password: z.preprocess(
          (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
          passwordSchema.optional(),
        ),
        isEnabled: z.boolean().default(true),
        sectorIds: z.array(z.string().uuid()).default([]),
      })
      .safeParse(input);
    if (!result.success) {
      throw new Error(result.error.issues.map((issue) => issue.message).join(" · "));
    }
    return result.data;
  })
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { hashQueuePassword } = await import("@/lib/queue/queue-auth.server");
    const { and, eq, inArray, ne } = await import("drizzle-orm");
    const panel = await requireOwnedPanel(data.panelId);
    const db = getDb();

    const taken = await db
      .select({ id: schema.queueOperators.id })
      .from(schema.queueOperators)
      .where(
        data.operatorId
          ? and(
              eq(schema.queueOperators.username, data.username),
              ne(schema.queueOperators.id, data.operatorId),
            )
          : eq(schema.queueOperators.username, data.username),
      )
      .limit(1);
    if (taken[0]) throw new Error("Este usuário já está em uso por outro operador.");

    // Só aceita setores do próprio painel.
    const validSectors =
      data.sectorIds.length > 0
        ? (
            await db
              .select({ id: schema.queueSectors.id })
              .from(schema.queueSectors)
              .where(
                and(
                  eq(schema.queueSectors.panelId, panel.id),
                  inArray(schema.queueSectors.id, data.sectorIds),
                ),
              )
          ).map((s) => s.id)
        : [];

    let operatorId = data.operatorId ?? null;
    if (operatorId) {
      await db
        .update(schema.queueOperators)
        .set({
          name: data.name,
          username: data.username,
          deskLabel: data.deskLabel ?? null,
          isEnabled: data.isEnabled,
          ...(data.password ? { passwordHash: await hashQueuePassword(data.password) } : {}),
        })
        .where(
          and(eq(schema.queueOperators.id, operatorId), eq(schema.queueOperators.panelId, panel.id)),
        );
    } else {
      if (!data.password) throw new Error("Defina uma senha para o operador.");
      const created = await db
        .insert(schema.queueOperators)
        .values({
          panelId: panel.id,
          name: data.name,
          username: data.username,
          deskLabel: data.deskLabel ?? null,
          passwordHash: await hashQueuePassword(data.password),
          isEnabled: data.isEnabled,
        })
        .returning({ id: schema.queueOperators.id });
      operatorId = created[0]?.id ?? null;
    }
    if (!operatorId) throw new Error("Não foi possível salvar o operador.");

    await db
      .delete(schema.queueOperatorSectors)
      .where(eq(schema.queueOperatorSectors.operatorId, operatorId));
    if (validSectors.length > 0) {
      await db
        .insert(schema.queueOperatorSectors)
        .values(validSectors.map((sectorId) => ({ operatorId: operatorId!, sectorId })));
    }
    return { ok: true };
  });

export const deleteQueueOperator = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ panelId: z.string().uuid(), operatorId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq } = await import("drizzle-orm");
    const panel = await requireOwnedPanel(data.panelId);
    await getDb()
      .delete(schema.queueOperators)
      .where(
        and(
          eq(schema.queueOperators.id, data.operatorId),
          eq(schema.queueOperators.panelId, panel.id),
        ),
      );
    return { ok: true };
  });

/** Gera (ou renova) o endereço da tela de emissão de senhas. */
export const rotateQueueKioskToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ panelId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { eq } = await import("drizzle-orm");
    const { randomBytes } = await import("node:crypto");
    const panel = await requireOwnedPanel(data.panelId);
    const { newEmitterCode } = await import("@/lib/queue/emitter-code.server");
    const kioskToken = randomBytes(16).toString("hex");
    await getDb()
      .update(schema.queuePanels)
      .set({ kioskToken, emitterCode: newEmitterCode() })
      .where(eq(schema.queuePanels.id, panel.id));
    return { ok: true, kioskToken } as const;
  });

/** Remove o tom de chamada personalizado, voltando ao tom padrão do sistema. */
export const clearQueueChime = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ deviceId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const panels = await db
      .select({ id: schema.queuePanels.id, key: schema.queuePanels.chimeStorageKey })
      .from(schema.queuePanels)
      .where(
        and(
          eq(schema.queuePanels.deviceId, data.deviceId),
          eq(schema.queuePanels.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    const panel = panels[0];
    if (!panel) throw new Error("Painel de senhas não encontrado.");

    await db
      .update(schema.queuePanels)
      .set({ chimeStorageKey: null, chimeName: null })
      .where(eq(schema.queuePanels.id, panel.id));

    if (panel.key) {
      try {
        const { deleteObject, isStorageConfigured } = await import("@/lib/storage.server");
        if (isStorageConfigured()) await deleteObject(panel.key);
      } catch {
        // objeto pode já não existir — ignorado
      }
    }

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(data.deviceId);
    return { ok: true };
  });
