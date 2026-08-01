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
  userName: string;
  /** Telas com emissão liberada e suas filas disponíveis. */
  panels: {
    panelId: string;
    panelName: string;
    mode: string;
    sectors: { id: string; name: string }[];
  }[];
} | null;

/**
 * Estado do terminal de emissão (/emitir). Usa o MESMO login do painel do
 * cliente e devolve apenas as telas e filas que o cliente liberou para
 * emissão — o terminal reconsulta esta função, então mudanças no painel
 * aparecem no terminal em tempo real.
 */
export const fetchIssuerState = createServerFn({ method: "GET" }).handler(
  async (): Promise<IssuerState> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;
    const { getSessionUser } = await import("@/lib/auth/session.server");
    const user = await getSessionUser();
    if (!user) return null;

    const { and, asc, eq, inArray } = await import("drizzle-orm");
    const db = getDb();

    const panels = await db
      .select({
        panelId: schema.queuePanels.id,
        mode: schema.queuePanels.mode,
        panelName: schema.devices.name,
      })
      .from(schema.queuePanels)
      .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanels.deviceId))
      .where(
        and(
          eq(schema.queuePanels.organizationId, user.organizationId),
          eq(schema.queuePanels.isEnabled, true),
          eq(schema.queuePanels.issuingEnabled, true),
        ),
      )
      .orderBy(asc(schema.devices.name));

    const panelIds = panels.map((panel) => panel.panelId);
    const sectors =
      panelIds.length > 0
        ? await db
            .select({
              id: schema.queueSectors.id,
              name: schema.queueSectors.name,
              panelId: schema.queueSectors.panelId,
            })
            .from(schema.queueSectors)
            .where(
              and(
                inArray(schema.queueSectors.panelId, panelIds),
                eq(schema.queueSectors.issuingEnabled, true),
              ),
            )
            .orderBy(asc(schema.queueSectors.position))
        : [];

    return {
      userName: user.name,
      panels: panels.map((panel) => ({
        panelId: panel.panelId,
        panelName: panel.panelName,
        mode: panel.mode,
        sectors: sectors
          .filter((sector) => sector.panelId === panel.panelId)
          .map(({ id, name }) => ({ id, name })),
      })),
    };
  },
);

/** Emite uma senha no terminal de emissão logado com a conta do cliente. */
export const issueTicketAsCustomer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        panelId: z.string().uuid(),
        sectorId: z.string().uuid().nullable().optional(),
        kind: z.enum(["normal", "priority"]).default("normal"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { issueTicket } = await import("@/lib/queue/tickets.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const rows = await db
      .select({ panel: schema.queuePanels, deviceName: schema.devices.name })
      .from(schema.queuePanels)
      .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanels.deviceId))
      .where(
        and(
          eq(schema.queuePanels.id, data.panelId),
          eq(schema.queuePanels.organizationId, user.organizationId),
          eq(schema.queuePanels.isEnabled, true),
          eq(schema.queuePanels.issuingEnabled, true),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("Emissão indisponível para esta tela.");
    const panel = row.panel;

    const sectorId = data.sectorId ?? null;
    if (panel.mode === "sector" && !sectorId) throw new Error("Escolha uma fila.");
    if (sectorId) {
      const sectors = await db
        .select({ id: schema.queueSectors.id })
        .from(schema.queueSectors)
        .where(
          and(
            eq(schema.queueSectors.id, sectorId),
            eq(schema.queueSectors.panelId, panel.id),
            eq(schema.queueSectors.issuingEnabled, true),
          ),
        )
        .limit(1);
      if (!sectors[0]) throw new Error("Esta fila não está liberada para emissão.");
    }

    const ticket = await issueTicket(panel, { sectorId, kind: data.kind });
    return { ...ticket, panelName: row.deviceName, issuedAt: new Date().toISOString() };
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
