import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type KioskPanel = {
  panelId: string;
  panelName: string;
  mode: string;
  priorityPolicy: string;
  sectors: { id: string; name: string }[];
} | null;

const tokenSchema = z.string().trim().length(32);

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
      .where(
        and(
          eq(schema.queueSectors.panelId, panel.panelId),
          eq(schema.queueSectors.issuingEnabled, true),
        ),
      )
      .orderBy(asc(schema.queueSectors.position));

    return {
      panelId: panel.panelId,
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

    const availableSectors = await getDb()
      .select({ id: schema.queueSectors.id })
      .from(schema.queueSectors)
      .where(
        and(
          eq(schema.queueSectors.panelId, panel.id),
          eq(schema.queueSectors.issuingEnabled, true),
        ),
      );
    const sectorId =
      availableSectors.length === 0
        ? null
        : availableSectors.length === 1
          ? (availableSectors[0]?.id ?? null)
          : (data.sectorId ?? null);
    if (availableSectors.length > 1 && !sectorId) throw new Error("Escolha o atendimento.");
    if (sectorId && !availableSectors.some((sector) => sector.id === sectorId)) {
      throw new Error("Esta fila não está disponível para emissão.");
    }

    const ticket = await issueTicket(panel, {
      sectorId,
      kind: data.kind,
    });
    return ticket;
  });
