import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  kind: z.enum(["normal", "priority"]).default("normal"),
  sectorId: z.string().uuid().nullable().optional(),
});

/** Native Android hybrid issuer endpoint. Roku and Web do not use this route. */
export const Route = createFileRoute("/api/public/queue/issue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = bodySchema.safeParse(await request.json().catch(() => ({})));
        if (!body.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });
        const token =
          request.headers
            .get("authorization")
            ?.replace(/^Bearer\s+/i, "")
            .trim() ?? "";
        if (token.length < 20) return Response.json({ error: "Não autorizado." }, { status: 401 });

        const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured())
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        const { and, eq, or } = await import("drizzle-orm");
        const { hashEmitterToken } = await import("@/lib/queue/emitter-auth.server");
        const { hashDeviceToken } = await import("@/lib/player/player-auth.server");
        const db = getDb();
        const rows = await db
          .select({
            panelId: schema.queuePanels.id,
            organizationId: schema.queuePanels.organizationId,
          })
          .from(schema.queuePanels)
          .innerJoin(
            schema.queuePanelDevices,
            eq(schema.queuePanelDevices.panelId, schema.queuePanels.id),
          )
          .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanelDevices.deviceId))
          .leftJoin(schema.queueEmitters, eq(schema.queueEmitters.panelId, schema.queuePanels.id))
          .where(
            and(
              eq(schema.queuePanels.isEnabled, true),
              or(
                eq(schema.devices.tokenHash, hashDeviceToken(token)),
                eq(schema.queueEmitters.tokenHash, hashEmitterToken(token)),
                eq(schema.queuePanels.kioskToken, token),
              ),
            ),
          )
          .limit(1);
        const panelId = rows[0]?.panelId;
        const { isOrganizationServiceSuspended, suspendedServiceResponse } = await import(
          "@/lib/billing/access.server"
        );
        if (await isOrganizationServiceSuspended(rows[0]?.organizationId ?? null)) {
          return suspendedServiceResponse();
        }
        const panel = panelId
          ? await db.query.queuePanels.findFirst({ where: eq(schema.queuePanels.id, panelId) })
          : null;
        if (!panel)
          return Response.json({ error: "Terminal de emissão inválido." }, { status: 404 });

        const available = await db
          .select({ id: schema.queueSectors.id })
          .from(schema.queueSectors)
          .where(
            and(
              eq(schema.queueSectors.panelId, panel.id),
              eq(schema.queueSectors.issuingEnabled, true),
            ),
          );
        const sectorId =
          available.length === 0
            ? null
            : available.length === 1
              ? available[0]!.id
              : (body.data.sectorId ?? null);
        if (available.length > 1 && !sectorId)
          return Response.json({ error: "Escolha o atendimento." }, { status: 409 });
        if (sectorId && !available.some((item) => item.id === sectorId)) {
          return Response.json({ error: "Esta fila não está disponível." }, { status: 409 });
        }
        const { issueTicket } = await import("@/lib/queue/tickets.server");
        const ticket = await issueTicket(panel, { sectorId, kind: body.data.kind });
        return Response.json({ ok: true, ticket }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
