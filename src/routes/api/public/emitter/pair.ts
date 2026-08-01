import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ code: z.string().trim().min(4).max(12) });

/**
 * Vinculação do terminal emissor de senhas (app Windows). O código curto é
 * mostrado no painel do cliente, igual ao pareamento das TVs; em troca, o app
 * recebe o token da tela de emissão e passa a operar sem login.
 */
export const Route = createFileRoute("/api/public/emitter/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (await request.json().catch(() => null)) as unknown;
        const parsed = bodySchema.safeParse(json);
        if (!parsed.success) {
          return Response.json({ ok: false, message: "Código inválido." }, { status: 400 });
        }
        const code = parsed.data.code.toUpperCase();

        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ ok: false, message: "Servidor indisponível." }, { status: 503 });
        }
        const { and, eq } = await import("drizzle-orm");
        const db = getDb();

        const rows = await db
          .select({
            kioskToken: schema.queuePanels.kioskToken,
            panelName: schema.devices.name,
          })
          .from(schema.queuePanels)
          .innerJoin(schema.devices, eq(schema.devices.id, schema.queuePanels.deviceId))
          .where(
            and(
              eq(schema.queuePanels.emitterCode, code),
              eq(schema.queuePanels.isEnabled, true),
              eq(schema.queuePanels.issuingEnabled, true),
            ),
          )
          .limit(1);

        const row = rows[0];
        if (!row?.kioskToken) {
          return Response.json(
            { ok: false, message: "Código não encontrado ou emissão desativada." },
            { status: 404 },
          );
        }

        return Response.json({
          ok: true,
          token: row.kioskToken,
          panelName: row.panelName,
          url: `/emitir/${row.kioskToken}`,
        });
      },
    },
  },
});