import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["next", "repeat"]).default("next"),
  sectorId: z.string().uuid().nullable().optional(),
});

/** Calls queue tickets from an authenticated Android hybrid terminal. */
export const Route = createFileRoute("/api/public/queue/call")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return Response.json({ error: "Dados inválidos." }, { status: 400 });

        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device) return Response.json({ error: "Não autorizado." }, { status: 401 });
        const modes = Array.isArray(device.enabledModes) ? device.enabledModes : ["display"];
        if (!modes.includes("caller")) {
          return Response.json({ error: "Chamada não habilitada neste terminal." }, { status: 403 });
        }

        const { getDb, schema } = await import("@/lib/db/index.server");
        const { and, asc, desc, eq, sql } = await import("drizzle-orm");
        const db = getDb();
        const link = (
          await db
            .select({ panelId: schema.queuePanels.id })
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
        if (!link) return Response.json({ error: "Fila não configurada." }, { status: 404 });

        if (parsed.data.action === "repeat") {
          const last = (
            await db
              .select({ id: schema.queueCalls.id, label: schema.queueCalls.label })
              .from(schema.queueCalls)
              .where(eq(schema.queueCalls.panelId, link.panelId))
              .orderBy(desc(schema.queueCalls.calledAt))
              .limit(1)
          )[0];
          if (!last) {
            return Response.json({ ok: false, empty: true, message: "Nenhuma senha foi chamada." });
          }
          await db
            .update(schema.queueCalls)
            .set({ repeatCount: sql`${schema.queueCalls.repeatCount} + 1`, calledAt: new Date() })
            .where(eq(schema.queueCalls.id, last.id));
          const { notifyQueueDevices } = await import("@/lib/queue/queue-devices.server");
          await notifyQueueDevices(link.panelId);
          return Response.json({ ok: true, label: last.label });
        }

        const panel = await db.query.queuePanels.findFirst({
          where: eq(schema.queuePanels.id, link.panelId),
        });
        if (!panel) return Response.json({ error: "Fila não encontrada." }, { status: 404 });

        const sectorId = parsed.data.sectorId ?? null;
        if (sectorId) {
          const validSector = await db.query.queueSectors.findFirst({
            where: and(
              eq(schema.queueSectors.id, sectorId),
              eq(schema.queueSectors.panelId, panel.id),
            ),
          });
          if (!validSector) return Response.json({ error: "Fila inválida." }, { status: 400 });
        }

        const nextOf = async (kind: "normal" | "priority") =>
          (
            await db
              .select()
              .from(schema.queueTickets)
              .where(
                and(
                  eq(schema.queueTickets.panelId, panel.id),
                  eq(schema.queueTickets.status, "waiting"),
                  eq(schema.queueTickets.kind, kind),
                  sectorId ? eq(schema.queueTickets.sectorId, sectorId) : undefined,
                ),
              )
              .orderBy(asc(schema.queueTickets.issuedAt))
              .limit(1)
          )[0];

        const { pickNextKind } = await import("@/lib/queue/tickets.server");
        let ticket: typeof schema.queueTickets.$inferSelect | undefined;
        for (let attempt = 0; attempt < 6 && !ticket; attempt += 1) {
          const [normal, priority] = await Promise.all([nextOf("normal"), nextOf("priority")]);
          const kind = pickNextKind(panel.priorityPolicy, panel.lastCalledKind, {
            normal: Boolean(normal),
            priority: Boolean(priority),
          });
          const candidate = kind === "priority" ? priority : kind === "normal" ? normal : undefined;
          if (!candidate) break;
          ticket = (
            await db
              .update(schema.queueTickets)
              .set({ status: "called", calledAt: new Date(), calledByOperatorId: null })
              .where(
                and(
                  eq(schema.queueTickets.id, candidate.id),
                  eq(schema.queueTickets.status, "waiting"),
                ),
              )
              .returning()
          )[0];
        }
        if (!ticket) {
          return Response.json({ ok: false, empty: true, message: "Nenhuma senha aguardando." });
        }

        const deskLabel = device.name;
        const { buildSpokenText } = await import("@/lib/queue/queue-auth.server");
        await db
          .update(schema.queuePanels)
          .set({ lastCalledKind: ticket.kind })
          .where(eq(schema.queuePanels.id, panel.id));
        const call = await db
          .insert(schema.queueCalls)
          .values({
            panelId: panel.id,
            sectorId: ticket.sectorId,
            sectorName: ticket.sectorName,
            operatorId: null,
            deskLabel,
            number: ticket.number,
            label: ticket.label,
            kind: ticket.kind,
            ticketId: ticket.id,
            spokenText: buildSpokenText(deskLabel, ticket.label, ticket.kind),
          })
          .returning({ id: schema.queueCalls.id });
        const { notifyQueueDevices } = await import("@/lib/queue/queue-devices.server");
        await notifyQueueDevices(panel.id);
        return Response.json({ ok: true, id: call[0]?.id ?? null, label: ticket.label });
      },
    },
  },
});
