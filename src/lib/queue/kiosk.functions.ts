import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type KioskTheme = {
  bgColor: string;
  bgImageUrl: string | null;
  cardColor: string;
  titleColor: string;
  textColor: string;
  normalButtonColor: string;
  normalButtonTextColor: string;
  priorityButtonColor: string;
  priorityButtonTextColor: string;
  title: string;
  logoUrl: string | null;
  logoHeight: number;
};

export type KioskPanel = {
  panelId: string;
  panelName: string;
  mode: string;
  priorityPolicy: string;
  sectors: { id: string; name: string }[];
  theme: KioskTheme;
} | null;

const tokenSchema = z.string().trim().min(32).max(64);

/** Reads the kiosk configuration by token. No login: the token is the secret. */
export const getKioskPanel = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }): Promise<KioskPanel> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) return null;
    const { and, asc, eq, or } = await import("drizzle-orm");
    const { hashEmitterToken } = await import("@/lib/queue/emitter-auth.server");
    const db = getDb();

    const rows = await db
      .select({
        panelId: schema.queuePanels.id,
        mode: schema.queuePanels.mode,
        priorityPolicy: schema.queuePanels.priorityPolicy,
        deviceName: schema.devices.name,
        kioskBgColor: schema.queuePanels.kioskBgColor,
        kioskBgMediaId: schema.queuePanels.kioskBgMediaId,
        kioskCardColor: schema.queuePanels.kioskCardColor,
        kioskTitleColor: schema.queuePanels.kioskTitleColor,
        kioskTextColor: schema.queuePanels.kioskTextColor,
        kioskNormalButtonColor: schema.queuePanels.kioskNormalButtonColor,
        kioskNormalButtonTextColor: schema.queuePanels.kioskNormalButtonTextColor,
        kioskPriorityButtonColor: schema.queuePanels.kioskPriorityButtonColor,
        kioskPriorityButtonTextColor: schema.queuePanels.kioskPriorityButtonTextColor,
        kioskTitle: schema.queuePanels.kioskTitle,
        kioskShowLogo: schema.queuePanels.kioskShowLogo,
        kioskLogoHeight: schema.queuePanels.kioskLogoHeight,
        kioskLogoKey: schema.queuePanels.kioskLogoKey,
        kioskBgImageKey: schema.queuePanels.kioskBgImageKey,
        brandLogoKey: schema.organizations.brandLogoKey,
      })
      .from(schema.queuePanels)
      .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanels.deviceId))
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.queuePanels.organizationId),
      )
      .leftJoin(schema.queueEmitters, eq(schema.queueEmitters.panelId, schema.queuePanels.id))
      .where(
        and(
          or(
            eq(schema.queuePanels.kioskToken, data.token),
            eq(schema.queueEmitters.tokenHash, hashEmitterToken(data.token)),
          ),
          eq(schema.queuePanels.isEnabled, true),
        ),
      )
      .limit(1);

    const panel = rows[0];
    if (!panel) return null;

    // Imagem de fundo e logo assinadas para o terminal (URLs temporárias).
    let bgImageUrl: string | null = null;
    let logoUrl: string | null = null;
    try {
      const { isStorageConfigured, createDownloadUrl } = await import("@/lib/storage.server");
      if (isStorageConfigured()) {
        if (panel.kioskBgImageKey) {
          bgImageUrl = await createDownloadUrl(panel.kioskBgImageKey, 3600);
        } else if (panel.kioskBgMediaId) {
          const asset = await db
            .select({
              storageKey: schema.mediaAssets.storageKey,
              status: schema.mediaAssets.status,
            })
            .from(schema.mediaAssets)
            .where(eq(schema.mediaAssets.id, panel.kioskBgMediaId))
            .limit(1);
          const key = asset[0]?.status === "ready" ? asset[0]?.storageKey : null;
          if (key) bgImageUrl = await createDownloadUrl(key, 3600);
        }
        if (panel.kioskShowLogo && (panel.kioskLogoKey || panel.brandLogoKey)) {
          logoUrl = await createDownloadUrl(panel.kioskLogoKey ?? panel.brandLogoKey!, 3600);
        }
      }
    } catch {
      // Sem storage configurado o terminal segue funcionando apenas com cores.
    }

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
      theme: {
        bgColor: panel.kioskBgColor || "#0b1220",
        bgImageUrl,
        cardColor: panel.kioskCardColor || "#111a2e",
        titleColor: panel.kioskTitleColor || "#ffffff",
        textColor: panel.kioskTextColor || "#cbd5f5",
        normalButtonColor: panel.kioskNormalButtonColor || "#2563eb",
        normalButtonTextColor: panel.kioskNormalButtonTextColor || "#ffffff",
        priorityButtonColor: panel.kioskPriorityButtonColor || "#f59e0b",
        priorityButtonTextColor: panel.kioskPriorityButtonTextColor || "#0b1220",
        title: panel.kioskTitle?.trim() || "Retire sua senha",
        logoUrl,
        logoHeight: panel.kioskLogoHeight ?? 96,
      },
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
    const { and, eq, or } = await import("drizzle-orm");
    const { hashEmitterToken } = await import("@/lib/queue/emitter-auth.server");

    const panelIds = await getDb()
      .select({ id: schema.queuePanels.id })
      .from(schema.queuePanels)
      .leftJoin(schema.queueEmitters, eq(schema.queueEmitters.panelId, schema.queuePanels.id))
      .where(
        and(
          or(
            eq(schema.queuePanels.kioskToken, data.token),
            eq(schema.queueEmitters.tokenHash, hashEmitterToken(data.token)),
          ),
          eq(schema.queuePanels.isEnabled, true),
        ),
      )
      .limit(1);
    const panelId = panelIds[0]?.id;
    const panel = panelId
      ? await getDb().query.queuePanels.findFirst({ where: eq(schema.queuePanels.id, panelId) })
      : null;
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
