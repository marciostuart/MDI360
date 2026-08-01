import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Fila de impressão para o serviço impressor de balcão (app Windows).
 * O token do painel é o segredo: quem o possui já pode emitir senhas.
 * Somente dados do cupom são retornados (rótulo, tipo, setor, horário) — sem PII.
 */
const querySchema = z.object({
  token: z.string().trim().length(32),
  /** ISO do último cupom já impresso; só retorna senhas emitidas depois disso. */
  since: z.string().trim().datetime().optional(),
});

export const Route = createFileRoute("/api/public/queue/print-spool")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse({
          token: url.searchParams.get("token") ?? "",
          since: url.searchParams.get("since") ?? undefined,
        });
        if (!parsed.success) return new Response("Parâmetros inválidos", { status: 400 });

        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) return new Response("Indisponível", { status: 503 });

        const { and, asc, eq, gt, lt } = await import("drizzle-orm");
        const db = getDb();

        const panels = await db
          .select({
            panelId: schema.queuePanels.id,
            deviceName: schema.devices.name,
          })
          .from(schema.queuePanels)
          .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanels.deviceId))
          .where(
            and(
              eq(schema.queuePanels.kioskToken, parsed.data.token),
              eq(schema.queuePanels.isEnabled, true),
            ),
          )
          .limit(1);

        const panel = panels[0];
        if (!panel) return new Response("Token inválido", { status: 404 });

        const now = new Date();
        // Janela de segurança: nunca imprime histórico antigo ao conectar.
        const floor = new Date(now.getTime() - 10 * 60 * 1000);
        const sinceAt = parsed.data.since ? new Date(parsed.data.since) : floor;
        const from = sinceAt > floor ? sinceAt : floor;

        const rows = await db
          .select({
            id: schema.queueTickets.id,
            label: schema.queueTickets.label,
            kind: schema.queueTickets.kind,
            sectorId: schema.queueTickets.sectorId,
            sectorName: schema.queueTickets.sectorName,
            issuedAt: schema.queueTickets.issuedAt,
          })
          .from(schema.queueTickets)
          .where(and(eq(schema.queueTickets.panelId, panel.panelId), gt(schema.queueTickets.issuedAt, from)))
          .orderBy(asc(schema.queueTickets.issuedAt))
          .limit(20);

        const tickets = [];
        for (const row of rows) {
          const ahead = await db.$count(
            schema.queueTickets,
            and(
              eq(schema.queueTickets.panelId, panel.panelId),
              eq(schema.queueTickets.status, "waiting"),
              row.sectorId
                ? eq(schema.queueTickets.sectorId, row.sectorId)
                : eq(schema.queueTickets.panelId, panel.panelId),
              lt(schema.queueTickets.issuedAt, row.issuedAt),
            ),
          );
          tickets.push({
            id: row.id,
            label: row.label,
            kind: row.kind,
            sectorName: row.sectorName,
            issuedAt: row.issuedAt.toISOString(),
            waitingAhead: ahead,
          });
        }

        return Response.json(
          { panelName: panel.deviceName, serverTime: now.toISOString(), tickets },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
