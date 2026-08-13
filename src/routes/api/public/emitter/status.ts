import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/emitter/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { bearerToken, hashEmitterToken } = await import(
            "@/lib/queue/emitter-auth.server"
          );
          const token = bearerToken(request);
          if (!token) return new Response("Não autorizado", { status: 401 });
          const { getDb, schema } = await import("@/lib/db/index.server");
          const { eq } = await import("drizzle-orm");
          const emitter = await getDb().query.queueEmitters.findFirst({
            columns: { id: true, panelId: true, pairingCode: true, pairingExpiresAt: true },
            where: eq(schema.queueEmitters.tokenHash, hashEmitterToken(token)),
          });
          if (!emitter) return new Response("Terminal desconhecido", { status: 404 });

          if (!emitter.panelId) {
            if (!emitter.pairingCode || !emitter.pairingExpiresAt || emitter.pairingExpiresAt <= new Date()) {
              await getDb().delete(schema.queueEmitters).where(eq(schema.queueEmitters.id, emitter.id));
              return new Response("Código expirado", { status: 410 });
            }
            return Response.json(
              {
                state: "waiting",
                pairingCode: emitter.pairingCode,
                expiresAt: emitter.pairingExpiresAt.toISOString(),
              },
              { headers: { "cache-control": "no-store" } },
            );
          }

          const panel = await getDb().query.queuePanels.findFirst({
            columns: { organizationId: true },
            where: eq(schema.queuePanels.id, emitter.panelId),
          });
          const { isOrganizationServiceSuspended } = await import("@/lib/billing/access.server");
          if (await isOrganizationServiceSuspended(panel?.organizationId ?? null)) {
            return Response.json(
              { state: "suspended" },
              { headers: { "cache-control": "no-store" } },
            );
          }

          await getDb()
            .update(schema.queueEmitters)
            .set({ lastSeenAt: new Date() })
            .where(eq(schema.queueEmitters.id, emitter.id));
          return Response.json(
            { state: "linked", panelId: emitter.panelId },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          console.error("[emitter-status] falha ao consultar terminal", error);
          return new Response("Erro interno", { status: 500 });
        }
      },
    },
  },
});
