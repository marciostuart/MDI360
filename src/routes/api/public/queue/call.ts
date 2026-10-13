import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["next", "repeat"]).default("next"),
  sectorId: z.string().uuid().nullable().optional(),
  operatorId: z.string().uuid().nullable().optional(),
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
        const { isOrganizationServiceSuspended, suspendedServiceResponse } = await import(
          "@/lib/billing/access.server"
        );
        if (device && (await isOrganizationServiceSuspended(device.organizationId))) {
          return suspendedServiceResponse();
        }
        if (!device) return Response.json({ error: "Não autorizado." }, { status: 401 });
        const modes = Array.isArray(device.enabledModes) ? device.enabledModes : ["display"];
        if (!modes.includes("caller")) {
          return Response.json({ error: "Chamada não habilitada neste terminal." }, { status: 403 });
        }

        const { getDb, schema } = await import("@/lib/db/index.server");
        const { and, asc, desc, eq, inArray, sql } = await import("drizzle-orm");
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

        const operator = parsed.data.operatorId ? await db.query.queueOperators.findFirst({
          where: and(
            eq(schema.queueOperators.id, parsed.data.operatorId),
            eq(schema.queueOperators.panelId, link.panelId),
            eq(schema.queueOperators.isEnabled, true),
          ),
        }) : null;
        if (parsed.data.operatorId && !operator) return Response.json({ error: "Invalid operator" }, { status: 400 });
        const allowedSectors = operator ? await db
          .select({ sectorId: schema.queueOperatorSectors.sectorId })
          .from(schema.queueOperatorSectors)
          .where(eq(schema.queueOperatorSectors.operatorId, operator.id)) : [];
        const allowedSectorIds = allowedSectors.map((row) => row.sectorId);
        if (
          parsed.data.sectorId &&
          allowedSectorIds.length > 0 &&
          !allowedSectorIds.includes(parsed.data.sectorId)
        ) {
          return Response.json({ error: "Operador sem acesso a este setor." }, { status: 403 });
        }
        const operatorSectorFilter = operator && allowedSectorIds.length
          ? inArray(schema.queueTickets.sectorId, allowedSectorIds)
          : undefined;

        if (parsed.data.action === "repeat") {
          const last = (
            await db
              .select({
                id: schema.queueCalls.id,
                label: schema.queueCalls.label,
                kind: schema.queueCalls.kind,
              })
              .from(schema.queueCalls)
              .where(
                and(
                  eq(schema.queueCalls.panelId, link.panelId),
                  operator ? eq(schema.queueCalls.operatorId, operator.id) : undefined,
                ),
              )
              .orderBy(desc(schema.queueCalls.calledAt))
              .limit(1)
          )[0];
          if (!last) {
            return Response.json({ ok: false, empty: true, message: "Nenhuma senha foi chamada." });
          }
          const deskLabel = operator?.deskLabel?.trim() || operator?.name || device.name;
          const { buildSpokenText } = await import("@/lib/queue/queue-auth.server");
          await db
            .update(schema.queueCalls)
            .set({
              operatorId: operator?.id ?? null,
              deskLabel,
              sectorName: deskLabel,
              spokenText: buildSpokenText(deskLabel, last.label, last.kind),
              repeatCount: sql`${schema.queueCalls.repeatCount} + 1`,
              calledAt: new Date(),
            })
            .where(eq(schema.queueCalls.id, last.id));
          const { notifyQueueDevices } = await import("@/lib/queue/queue-devices.server");
          notifyQueueDevices(link.panelId, device.id);
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
                  sectorId ? eq(schema.queueTickets.sectorId, sectorId) : operatorSectorFilter,
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
              .set({ status: "called", calledAt: new Date(), calledByOperatorId: operator?.id ?? null })
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

        const deskLabel = operator?.deskLabel?.trim() || operator?.name || device.name;
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
            operatorId: operator?.id ?? null,
            deskLabel,
            number: ticket.number,
            label: ticket.label,
            kind: ticket.kind,
            ticketId: ticket.id,
            spokenText: buildSpokenText(deskLabel, ticket.label, ticket.kind),
          })
          .returning({ id: schema.queueCalls.id });
        const { notifyQueueDevices } = await import("@/lib/queue/queue-devices.server");
        notifyQueueDevices(panel.id, device.id);
        return Response.json({ ok: true, id: call[0]?.id ?? null, label: ticket.label });
      },
    },
  },
});
