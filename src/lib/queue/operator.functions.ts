import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type QueueSector = {
  id: string;
  name: string;
  prefix: string | null;
  lastNumber: number;
  position: number;
  /** Senhas aguardando neste setor. */
  waitingNormal: number;
  waitingPriority: number;
};

export type QueueCall = {
  id: string;
  label: string;
  sectorName: string | null;
  calledAt: string;
  repeatCount: number;
  kind: string;
  /** Guichê que chamou, quando houver. */
  deskLabel?: string | null;
  /** True quando a chamada é do guichê logado. */
  mine?: boolean;
};

export type QueueOperatorState = {
  panel: {
    id: string;
    deviceName: string;
    mode: string;
    prefix: string | null;
    displaySeconds: number;
    numberingScope: string;
    priorityPolicy: string;
  };
  operator: { name: string; username: string; deskLabel: string | null };
  sectors: QueueSector[];
  calls: QueueCall[];
  /** Senha em atendimento neste guichê (última chamada por ele). */
  myCall: QueueCall | null;
  waiting: { normal: number; priority: number };
} | null;

/** Everything the operator panel renders. Returns null when not signed in. */
export const fetchQueueState = createServerFn({ method: "GET" }).handler(
  async (): Promise<QueueOperatorState> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;

    const { getQueueSession } = await import("@/lib/queue/queue-auth.server");
    const session = await getQueueSession();
    if (!session) return null;

    const { and, asc, desc, eq, inArray, sql } = await import("drizzle-orm");
    const db = getDb();

    const allSectors = await db
      .select()
      .from(schema.queueSectors)
      .where(eq(schema.queueSectors.panelId, session.panelId))
      .orderBy(asc(schema.queueSectors.position));

    // O operador só vê as filas designadas a ele (sem designação = todas).
    const sectors =
      session.allowedSectorIds.length > 0
        ? allSectors.filter((s) => session.allowedSectorIds.includes(s.id))
        : allSectors;
    const visibleIds = sectors.map((s) => s.id);

    const calls = await db
      .select()
      .from(schema.queueCalls)
      .where(eq(schema.queueCalls.panelId, session.panelId))
      .orderBy(desc(schema.queueCalls.calledAt))
      .limit(20);

    const waitingRows = await db
      .select({
        sectorId: schema.queueTickets.sectorId,
        kind: schema.queueTickets.kind,
        total: sql<number>`count(*)::int`,
      })
      .from(schema.queueTickets)
      .where(
        and(
          eq(schema.queueTickets.panelId, session.panelId),
          eq(schema.queueTickets.status, "waiting"),
        ),
      )
      .groupBy(schema.queueTickets.sectorId, schema.queueTickets.kind);

    const inScope = (sectorId: string | null) =>
      allSectors.length === 0 ||
      session.allowedSectorIds.length === 0 ||
      (sectorId !== null && visibleIds.includes(sectorId));

    const waiting = { normal: 0, priority: 0 };
    const perSector = new Map<string, { normal: number; priority: number }>();
    for (const row of waitingRows) {
      const total = Number(row.total);
      if (row.sectorId) {
        const entry = perSector.get(row.sectorId) ?? { normal: 0, priority: 0 };
        if (row.kind === "priority") entry.priority += total;
        else entry.normal += total;
        perSector.set(row.sectorId, entry);
      }
      if (!inScope(row.sectorId)) continue;
      if (row.kind === "priority") waiting.priority += total;
      else waiting.normal += total;
    }
    void inArray;

    return {
      panel: {
        id: session.panelId,
        deviceName: session.deviceName,
        mode: session.mode,
        prefix: session.prefix,
        displaySeconds: session.displaySeconds,
        numberingScope: session.numberingScope,
        priorityPolicy: session.priorityPolicy,
      },
      operator: {
        name: session.operatorName,
        username: session.username,
        deskLabel: session.deskLabel ?? null,
      },
      sectors: sectors.map((s) => ({
        id: s.id,
        name: s.name,
        prefix: s.prefix,
        lastNumber: s.lastNumber,
        position: s.position,
        waitingNormal: perSector.get(s.id)?.normal ?? 0,
        waitingPriority: perSector.get(s.id)?.priority ?? 0,
      })),
      calls: calls.map((c) => ({
        id: c.id,
        label: c.label,
        sectorName: c.deskLabel ?? c.sectorName,
        calledAt: c.calledAt.toISOString(),
        repeatCount: c.repeatCount,
        kind: c.kind,
        deskLabel: c.deskLabel ?? null,
        mine: c.operatorId === session.operatorId,
      })),
      myCall: (() => {
        const own = calls.find((c) => c.operatorId === session.operatorId);
        if (!own) return null;
        return {
          id: own.id,
          label: own.label,
          sectorName: own.deskLabel ?? own.sectorName,
          calledAt: own.calledAt.toISOString(),
          repeatCount: own.repeatCount,
          kind: own.kind,
          deskLabel: own.deskLabel ?? null,
          mine: true,
        };
      })(),
      waiting,
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

    const { authenticateOperator, createQueueSession } =
      await import("@/lib/queue/queue-auth.server");
    const operator = await authenticateOperator(data.username, data.password);
    if (!operator) return { ok: false, message: "Usuário ou senha inválidos." };
    await createQueueSession(operator.panelId, operator.operatorId);
    return { ok: true };
  });

export const queueLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { destroyQueueSession } = await import("@/lib/queue/queue-auth.server");
  await destroyQueueSession();
  return { ok: true };
});

/**
 * Chama a próxima senha da fila.
 *
 * A escolha respeita a política configurada pelo cliente: "Prioritário" chama
 * todas as preferenciais antes das normais; "Intercalado" alterna uma
 * preferencial e uma normal. Se não houver nenhuma senha emitida aguardando,
 * NADA é chamado (o painel nunca inventa senhas).
 */
export const callNextTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ sectorId: z.string().uuid().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireQueueSession, buildSpokenText } = await import("@/lib/queue/queue-auth.server");
    const { pickNextKind } = await import("@/lib/queue/tickets.server");
    const { and, asc, eq, isNull } = await import("drizzle-orm");
    const session = await requireQueueSession();
    const db = getDb();

    const sectorId = data.sectorId ?? null;
    const hasSectors =
      (
        await db
          .select({ id: schema.queueSectors.id })
          .from(schema.queueSectors)
          .where(eq(schema.queueSectors.panelId, session.panelId))
          .limit(1)
      ).length > 0;
    if (hasSectors && !sectorId) throw new Error("Escolha um setor para chamar.");
    if (
      sectorId &&
      session.allowedSectorIds.length > 0 &&
      !session.allowedSectorIds.includes(sectorId)
    ) {
      throw new Error("Você não tem permissão para chamar este setor.");
    }

    const panels = await db
      .select()
      .from(schema.queuePanels)
      .where(eq(schema.queuePanels.id, session.panelId))
      .limit(1);
    const panel = panels[0];
    if (!panel) throw new Error("Painel não encontrado.");

    const scopeFilter = (kind: "normal" | "priority") =>
      and(
        eq(schema.queueTickets.panelId, panel.id),
        eq(schema.queueTickets.status, "waiting"),
        eq(schema.queueTickets.kind, kind),
        sectorId ? eq(schema.queueTickets.sectorId, sectorId) : undefined,
        hasSectors ? undefined : isNull(schema.queueTickets.sectorId),
      );

    const nextOf = async (kind: "normal" | "priority") =>
      (
        await db
          .select()
          .from(schema.queueTickets)
          .where(scopeFilter(kind))
          .orderBy(asc(schema.queueTickets.issuedAt))
          .limit(1)
      )[0];

    /**
     * Fila comum com vários guichês: a senha é reservada de forma atômica
     * (`status = 'waiting'` na própria condição do UPDATE), então dois guichês
     * que chamam ao mesmo tempo nunca recebem a mesma senha — o segundo já
     * pega a seguinte.
     */
    let ticket: typeof schema.queueTickets.$inferSelect | undefined;

    for (let attempt = 0; attempt < 6 && !ticket; attempt += 1) {
      const [nextNormal, nextPriority] = await Promise.all([nextOf("normal"), nextOf("priority")]);
      const kind = pickNextKind(panel.priorityPolicy, panel.lastCalledKind, {
        normal: Boolean(nextNormal),
        priority: Boolean(nextPriority),
      });
      const candidate =
        kind === "priority" ? nextPriority : kind === "normal" ? nextNormal : undefined;
      if (!candidate) break;

      const claimed = await db
        .update(schema.queueTickets)
        .set({
          status: "called",
          calledAt: new Date(),
          calledByOperatorId: session.operatorId,
        })
        .where(
          and(eq(schema.queueTickets.id, candidate.id), eq(schema.queueTickets.status, "waiting")),
        )
        .returning();
      ticket = claimed[0];
    }

    if (!ticket) {
      // Fila vazia: não chama nem gera senha nova.
      return {
        ok: false as const,
        empty: true as const,
        id: null,
        label: null,
        kind: null,
        message: "Nenhuma senha aguardando na fila.",
      };
    }

    // Guichê do operador: quando definido, é o que a TV mostra e fala.
    const deskLabel = session.deskLabel ?? null;
    const announced = deskLabel ?? ticket.sectorName;

    await db
      .update(schema.queuePanels)
      .set({ lastCalledKind: ticket.kind })
      .where(eq(schema.queuePanels.id, panel.id));

    const inserted = await db
      .insert(schema.queueCalls)
      .values({
        panelId: panel.id,
        sectorId: ticket.sectorId,
        sectorName: announced,
        operatorId: session.operatorId,
        deskLabel,
        number: ticket.number,
        label: ticket.label,
        kind: ticket.kind,
        ticketId: ticket.id,
        spokenText: buildSpokenText(announced, ticket.label, ticket.kind),
      })
      .returning({ id: schema.queueCalls.id });

    const { notifyQueueDevices } = await import("@/lib/queue/queue-devices.server");
    await notifyQueueDevices(session.panelId);

    return {
      ok: true as const,
      empty: false as const,
      id: inserted[0]?.id ?? null,
      label: ticket.label,
      kind: ticket.kind,
    };
  });

/**
 * Repete a chamada: cada guichê repete a SUA última senha (não a do vizinho).
 * Sem nenhuma chamada própria, repete a última do painel.
 */
export const repeatLastTicket = createServerFn({ method: "POST" }).handler(async () => {
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { requireQueueSession } = await import("@/lib/queue/queue-auth.server");
  const { and, desc, eq, sql } = await import("drizzle-orm");
  const session = await requireQueueSession();
  const db = getDb();

  const own = await db
    .select({ id: schema.queueCalls.id, label: schema.queueCalls.label })
    .from(schema.queueCalls)
    .where(
      and(
        eq(schema.queueCalls.panelId, session.panelId),
        eq(schema.queueCalls.operatorId, session.operatorId),
      ),
    )
    .orderBy(desc(schema.queueCalls.calledAt))
    .limit(1);

  const last =
    own.length > 0
      ? own
      : await db
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

  const { notifyQueueDevices } = await import("@/lib/queue/queue-devices.server");
  await notifyQueueDevices(session.panelId);

  return { ok: true, label: last[0].label };
});
