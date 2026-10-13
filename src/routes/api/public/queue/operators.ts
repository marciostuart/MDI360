import { createFileRoute } from "@tanstack/react-router";

/** Public terminal endpoint: returns only enabled operators and display labels. */
export const Route = createFileRoute("/api/public/queue/operators")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device) return Response.json({ error: "Não autorizado." }, { status: 401 });
        const modes = Array.isArray(device.enabledModes) ? device.enabledModes : ["display"];
        if (!modes.includes("caller")) {
          return Response.json({ error: "Chamada não habilitada neste terminal." }, { status: 403 });
        }

        const { getDb, schema } = await import("@/lib/db/index.server");
        const { and, asc, eq } = await import("drizzle-orm");
        const db = getDb();
        const linkedPanel = (
          await db
            .select({ id: schema.queuePanels.id })
            .from(schema.queuePanelDevices)
            .innerJoin(schema.queuePanels, eq(schema.queuePanels.id, schema.queuePanelDevices.panelId))
            .where(
              and(
                eq(schema.queuePanelDevices.deviceId, device.id),
                eq(schema.queuePanels.isEnabled, true),
              ),
            )
            .limit(1)
        )[0];
        if (!linkedPanel) return Response.json({ error: "Fila não configurada." }, { status: 404 });

        const operators = await db
          .select({
            id: schema.queueOperators.id,
            name: schema.queueOperators.name,
            deskLabel: schema.queueOperators.deskLabel,
          })
          .from(schema.queueOperators)
          .where(
            and(
              eq(schema.queueOperators.panelId, linkedPanel.id),
              eq(schema.queueOperators.isEnabled, true),
            ),
          )
          .orderBy(asc(schema.queueOperators.name));

        const result = await Promise.all(
          operators.map(async (operator) => {
            const sectors = await db
              .select({ id: schema.queueSectors.id, name: schema.queueSectors.name })
              .from(schema.queueOperatorSectors)
              .innerJoin(schema.queueSectors, eq(schema.queueSectors.id, schema.queueOperatorSectors.sectorId))
              .where(eq(schema.queueOperatorSectors.operatorId, operator.id));
            return { ...operator, deskLabel: operator.deskLabel?.trim() || operator.name, sectors };
          }),
        );
        return Response.json({ operators: result });
      },
    },
  },
});
