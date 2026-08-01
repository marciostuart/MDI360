import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type KioskPanel = {
  panelName: string;
  mode: string;
  priorityPolicy: string;
  sectors: { id: string; name: string }[];
} | null;

const tokenSchema = z.string().trim().length(32);

export type IssuerState = {
  panelName: string;
  mode: string;
  operatorName: string;
  sectors: { id: string; name: string }[];
} | null;

/**
 * Estado da tela de emissão autenticada (/emitir). Usa a mesma sessão e os
 * mesmos usuários criados no painel do cliente, e só devolve os setores
 * (filas) liberados para o operador logado.
 */
export const fetchIssuerState = createServerFn({ method: "GET" }).handler(
  async (): Promise<IssuerState> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;
    const { getQueueSession } = await import("@/lib/queue/queue-auth.server");
    const session = await getQueueSession();
    if (!session) return null;

    const { asc, eq } = await import("drizzle-orm");
    const sectors = await getDb()
      .select({ id: schema.queueSectors.id, name: schema.queueSectors.name })
      .from(schema.queueSectors)
      .where(eq(schema.queueSectors.panelId, session.panelId))
      .orderBy(asc(schema.queueSectors.position));

    const allowed =
      session.allowedSectorIds.length > 0
        ? sectors.filter((sector) => session.allowedSectorIds.includes(sector.id))
        : sectors;

    return {
      panelName: session.deviceName,
      mode: session.mode,
      operatorName: session.operatorName,
      sectors: allowed,
    };
  },
);

/** Emite uma senha na tela de emissão logada (/emitir). */
export const issueTicketAsOperator = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        sectorId: z.string().uuid().nullable().optional(),
        kind: z.enum(["normal", "priority"]).default("normal"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireQueueSession } = await import("@/lib/queue/queue-auth.server");
    const { issueTicket } = await import("@/lib/queue/tickets.server");
    const { eq } = await import("drizzle-orm");
    const session = await requireQueueSession();

    const sectorId = data.sectorId ?? null;
    if (session.mode === "sector" && !sectorId) throw new Error("Escolha um setor.");
    if (
      sectorId &&
      session.allowedSectorIds.length > 0 &&
      !session.allowedSectorIds.includes(sectorId)
    ) {
      throw new Error("Você não tem permissão para emitir senhas desta fila.");
    }

    const panels = await getDb()
      .select()
      .from(schema.queuePanels)
      .where(eq(schema.queuePanels.id, session.panelId))
      .limit(1);
    const panel = panels[0];
    if (!panel) throw new Error("Painel não encontrado.");

    const ticket = await issueTicket(panel, { sectorId, kind: data.kind });
    return { ...ticket, panelName: session.deviceName, issuedAt: new Date().toISOString() };
  });

/** Reads the kiosk configuration by token. No login: the token is the secret. */
export const getKioskPanel = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }): Promise<KioskPanel> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;
    const { and, asc, eq } = await import("drizzle-orm");
    const db = getDb();

    const rows = await db
      .select({
        panelId: schema.queuePanels.id,
        mode: schema.queuePanels.mode,
        priorityPolicy: schema.queuePanels.priorityPolicy,
        deviceName: schema.devices.name,
      })
      .from(schema.queuePanels)
      .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanels.deviceId))
      .where(
        and(eq(schema.queuePanels.kioskToken, data.token), eq(schema.queuePanels.isEnabled, true)),
      )
      .limit(1);

    const panel = rows[0];
    if (!panel) return null;

    const sectors = await db
      .select({ id: schema.queueSectors.id, name: schema.queueSectors.name })
      .from(schema.queueSectors)
      .where(eq(schema.queueSectors.panelId, panel.panelId))
      .orderBy(asc(schema.queueSectors.position));

    return {
      panelName: panel.deviceName,
      mode: panel.mode,
      priorityPolicy: panel.priorityPolicy,
      sectors,
    };
  });

/** Emits a ticket from the reception/kiosk screen. */
export const issueKioskTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        sectorId: z.string().uuid().nullable().optional(),
        kind: z.enum(["normal", "priority"]).default("normal"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { issueTicket } = await import("@/lib/queue/tickets.server");
    const { and, eq } = await import("drizzle-orm");

    const panels = await getDb()
      .select()
      .from(schema.queuePanels)
      .where(
        and(eq(schema.queuePanels.kioskToken, data.token), eq(schema.queuePanels.isEnabled, true)),
      )
      .limit(1);
    const panel = panels[0];
    if (!panel) throw new Error("Tela de emissão inválida.");

    const ticket = await issueTicket(panel, {
      sectorId: data.sectorId ?? null,
      kind: data.kind,
    });
    return ticket;
  });
