import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Fila de impressão para o serviço impressor de balcão (app Windows).
 * O token do painel é o segredo: quem o possui já pode emitir senhas.
 * Somente dados do cupom são retornados (rótulo, tipo, setor, horário) — sem PII.
 */
const querySchema = z.object({
  /** ISO do último cupom já impresso; só retorna senhas emitidas depois disso. */
  since: z.string().trim().datetime().optional(),
});

export const Route = createFileRoute("/api/public/queue/print-spool")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const parsed = querySchema.safeParse({
            since: url.searchParams.get("since") ?? undefined,
          });
          if (!parsed.success) return new Response("Parâmetros inválidos", { status: 400 });

          const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
          if (!isDatabaseConfigured()) return new Response("Indisponível", { status: 503 });

          const { and, asc, eq, gt, or } = await import("drizzle-orm");
          const { bearerToken, hashEmitterToken } = await import("@/lib/queue/emitter-auth.server");
          const { hashDeviceToken } = await import("@/lib/player/player-auth.server");
          // Keep the query fallback only for emitters already installed before
          // Bearer authentication. New desktop builds send Authorization.
          const token = bearerToken(request) ?? url.searchParams.get("token")?.trim() ?? "";
          if (token.length < 8 || token.length > 128)
            return new Response("NÃ£o autorizado", { status: 401 });
          const db = getDb();

          const panels = await db
            .select({
              panelId: schema.queuePanels.id,
              deviceName: schema.devices.name,
              emitterId: schema.queueEmitters.id,
              printerFooterText: schema.queuePanels.printerFooterText,
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
                or(
                  eq(schema.queueEmitters.tokenHash, hashEmitterToken(token)),
                  eq(schema.queuePanels.kioskToken, token),
                  eq(schema.devices.tokenHash, hashDeviceToken(token)),
                ),
                eq(schema.queuePanels.isEnabled, true),
              ),
            )
            .limit(1);

          const panel = panels[0];
          if (!panel) return new Response("Token inválido", { status: 404 });
          if (panel.emitterId) {
            await db
              .update(schema.queueEmitters)
              .set({ lastSeenAt: new Date() })
              .where(eq(schema.queueEmitters.id, panel.emitterId));
          }

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
            .where(
              and(
                eq(schema.queueTickets.panelId, panel.panelId),
                gt(schema.queueTickets.issuedAt, from),
              ),
            )
            .orderBy(asc(schema.queueTickets.issuedAt))
            .limit(20);

          // Senhas aguardando no painel — usadas para calcular a posição na fila em memória.
          const waiting = await db
            .select({
              sectorId: schema.queueTickets.sectorId,
              issuedAt: schema.queueTickets.issuedAt,
            })
            .from(schema.queueTickets)
            .where(
              and(
                eq(schema.queueTickets.panelId, panel.panelId),
                eq(schema.queueTickets.status, "waiting"),
              ),
            );

          const tickets = rows.map((row) => ({
            id: row.id,
            label: row.label,
            kind: row.kind,
            sectorName: row.sectorName,
            issuedAt: row.issuedAt.toISOString(),
            waitingAhead: waiting.filter(
              (w) =>
                w.issuedAt < row.issuedAt && (row.sectorId ? w.sectorId === row.sectorId : true),
            ).length,
          }));

          return Response.json(
            {
              panelName: panel.deviceName,
              printerFooterText: panel.printerFooterText,
              serverTime: now.toISOString(),
              tickets,
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("[print-spool] falha ao consultar fila", error);
          return new Response("Erro interno", { status: 500 });
        }
      },
    },
  },
});
