import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type QueueSector = {
  id: string;
  name: string;
  prefix: string | null;
  lastNumber: number;
  position: number;
};

export type QueueCall = {
  id: string;
  label: string;
  sectorName: string | null;
  calledAt: string;
  repeatCount: number;
};

export type QueueOperatorState = {
  panel: {
    id: string;
    deviceName: string;
    mode: string;
    prefix: string | null;
    displaySeconds: number;
  };
  sectors: QueueSector[];
  calls: QueueCall[];
} | null;

/** Everything the operator panel renders. Returns null when not signed in. */
export const fetchQueueState = createServerFn({ method: "GET" }).handler(
  async (): Promise<QueueOperatorState> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;

    const { getQueueSession } = await import("@/lib/queue/queue-auth.server");
    const session = await getQueueSession();
    if (!session) return null;

    const { asc, desc, eq } = await import("drizzle-orm");
    const db = getDb();

    const sectors = await db
      .select()
      .from(schema.queueSectors)
      .where(eq(schema.queueSectors.panelId, session.panelId))
      .orderBy(asc(schema.queueSectors.position));

    const calls = await db
      .select()
      .from(schema.queueCalls)
      .where(eq(schema.queueCalls.panelId, session.panelId))
      .orderBy(desc(schema.queueCalls.calledAt))
      .limit(20);

    return {
      panel: {
        id: session.panelId,
        deviceName: session.deviceName,
        mode: session.mode,
        prefix: session.prefix,
        displaySeconds: session.displaySeconds,
      },
      sectors: sectors.map((s) => ({
        id: s.id,
        name: s.name,
        prefix: s.prefix,
        lastNumber: s.lastNumber,
        position: s.position,
      })),
      calls: calls.map((c) => ({
        id: c.id,
        label: c.label,
        sectorName: c.sectorName,
        calledAt: c.calledAt.toISOString(),
        repeatCount: c.repeatCount,
      })),
    };
  },
);

export const queueLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        username: z.string().trim().toLowerCase().min(3).max(40),
        password: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message?: string }> => {
    const { isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return { ok: false, message: "Serviço indisponível." };

    const { authenticateOperator, createQueueSession } = await import(
      "@/lib/queue/queue-auth.server"
    );
    const panelId = await authenticateOperator(data.username, data.password);
    if (!panelId) return { ok: false, message: "Usuário ou senha inválidos." };
    await createQueueSession(panelId);
    return { ok: true };
  });

export const queueLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { destroyQueueSession } = await import("@/lib/queue/queue-auth.server");
  await destroyQueueSession();
  return { ok: true };
});

/** Operator-owned setting: call by plain sequence or by named sector. */
export const setQueueMode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        mode: z.enum(["sequential", "sector"]),
        prefix: z.string().trim().toUpperCase().max(3).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireQueueSession } = await import("@/lib/queue/queue-auth.server");
    const { eq } = await import("drizzle-orm");
    const session = await requireQueueSession();

    await getDb()
      .update(schema.queuePanels)
      .set({ mode: data.mode, prefix: data.prefix ? data.prefix : null })
      .where(eq(schema.queuePanels.id, session.panelId));

    return { ok: true };
  });

export const saveQueueSector = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        sectorId: z.string().uuid().optional(),
        name: z.string().trim().min(1, "Informe o nome do setor").max(60),
        prefix: z.string().trim().toUpperCase().max(3).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireQueueSession } = await import("@/lib/queue/queue-auth.server");
    const { and, eq, sql } = await import("drizzle-orm");
    const session = await requireQueueSession();
    const db = getDb();

    if (data.sectorId) {
      await db
        .update(schema.queueSectors)
        .set({ name: data.name, prefix: data.prefix ? data.prefix : null })
        .where(
          and(
            eq(schema.queueSectors.id, data.sectorId),
            eq(schema.queueSectors.panelId, session.panelId),
          ),
        );
      return { ok: true };
    }

    const rows = await db
      .select({ next: sql<number>`coalesce(max(${schema.queueSectors.position}), -1) + 1` })
      .from(schema.queueSectors)
      .where(eq(schema.queueSectors.panelId, session.panelId));

    await db.insert(schema.queueSectors).values({
      panelId: session.panelId,
      name: data.name,
      prefix: data.prefix ? data.prefix : null,
      position: Number(rows[0]?.next ?? 0),
    });
    return { ok: true };
  });

export const deleteQueueSector = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ sectorId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireQueueSession } = await import("@/lib/queue/queue-auth.server");
    const { and, eq } = await import("drizzle-orm");
    const session = await requireQueueSession();

    await getDb()
      .delete(schema.queueSectors)
      .where(
        and(
          eq(schema.queueSectors.id, data.sectorId),
          eq(schema.queueSectors.panelId, session.panelId),
        ),
      );
    return { ok: true };
  });

/**
 * Calls the next ticket. The counter is incremented in SQL so two operators
 * clicking at the same instant never get the same number. Right after the
 * insert the TV is woken through the push channel, which is what makes the
 * playback stop "imediatamente".
 */
export const callNextTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ sectorId: z.string().uuid().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireQueueSession, buildLabel, buildSpokenText } = await import(
      "@/lib/queue/queue-auth.server"
    );
    const { and, eq, sql } = await import("drizzle-orm");
    const session = await requireQueueSession();
    const db = getDb();

    let sectorName: string | null = null;
    let sectorId: string | null = null;
    let label: string;
    let number: number;

    if (session.mode === "sector") {
      if (!data.sectorId) throw new Error("Escolha um setor para chamar.");
      const updated = await db
        .update(schema.queueSectors)
        .set({ lastNumber: sql`${schema.queueSectors.lastNumber} + 1` })
        .where(
          and(
            eq(schema.queueSectors.id, data.sectorId),
            eq(schema.queueSectors.panelId, session.panelId),
          ),
        )
        .returning({
          id: schema.queueSectors.id,
          name: schema.queueSectors.name,
          prefix: schema.queueSectors.prefix,
          lastNumber: schema.queueSectors.lastNumber,
        });
      const sector = updated[0];
      if (!sector) throw new Error("Setor não encontrado.");
      sectorId = sector.id;
      sectorName = sector.name;
      number = sector.lastNumber;
      label = buildLabel(sector.prefix, sector.lastNumber);
    } else {
      const updated = await db
        .update(schema.queuePanels)
        .set({ lastNumber: sql`${schema.queuePanels.lastNumber} + 1` })
        .where(eq(schema.queuePanels.id, session.panelId))
        .returning({
          lastNumber: schema.queuePanels.lastNumber,
          prefix: schema.queuePanels.prefix,
        });
      const panel = updated[0];
      if (!panel) throw new Error("Painel não encontrado.");
      number = panel.lastNumber;
      label = buildLabel(panel.prefix, panel.lastNumber);
    }

    const inserted = await db
      .insert(schema.queueCalls)
      .values({
        panelId: session.panelId,
        sectorId,
        sectorName,
        number,
        label,
        spokenText: buildSpokenText(sectorName, label),
      })
      .returning({ id: schema.queueCalls.id, label: schema.queueCalls.label });

    const { notifyDevice } = await import("@/lib/player/realtime.server");
    notifyDevice(session.deviceId);

    return { ok: true, id: inserted[0]?.id ?? null, label };
  });

/** Repeats the last call: same ticket, new announcement on the TV. */
export const repeatLastTicket = createServerFn({ method: "POST" }).handler(async () => {
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { requireQueueSession } = await import("@/lib/queue/queue-auth.server");
  const { desc, eq, sql } = await import("drizzle-orm");
  const session = await requireQueueSession();
  const db = getDb();

  const last = await db
    .select({ id: schema.queueCalls.id, label: schema.queueCalls.label })
    .from(schema.queueCalls)
    .where(eq(schema.queueCalls.panelId, session.panelId))
    .orderBy(desc(schema.queueCalls.calledAt))
    .limit(1);

  if (!last[0]) throw new Error("Nenhuma senha foi chamada ainda.");

  await db
    .update(schema.queueCalls)
    .set({
      repeatCount: sql`${schema.queueCalls.repeatCount} + 1`,
      calledAt: new Date(),
    })
    .where(eq(schema.queueCalls.id, last[0].id));

  const { notifyDevice } = await import("@/lib/player/realtime.server");
  notifyDevice(session.deviceId);

  return { ok: true, label: last[0].label };
});

/** Resets the counters (start of a new day / new shift). */
export const resetQueueCounters = createServerFn({ method: "POST" }).handler(async () => {
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { requireQueueSession } = await import("@/lib/queue/queue-auth.server");
  const { eq } = await import("drizzle-orm");
  const session = await requireQueueSession();
  const db = getDb();

  await db
    .update(schema.queuePanels)
    .set({ lastNumber: 0 })
    .where(eq(schema.queuePanels.id, session.panelId));
  await db
    .update(schema.queueSectors)
    .set({ lastNumber: 0 })
    .where(eq(schema.queueSectors.panelId, session.panelId));
  await db.delete(schema.queueCalls).where(eq(schema.queueCalls.panelId, session.panelId));

  return { ok: true };
});
