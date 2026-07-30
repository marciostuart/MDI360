import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z
  .object({
    appVersion: z.string().trim().max(40).optional(),
    playlistRevision: z.number().int().min(0).optional(),
  })
  .partial();

/**
 * Heartbeat + content sync for a paired TV. Authenticated by the device token,
 * never by a user session, and it only ever returns that device's own content.
 */
export const Route = createFileRoute("/api/public/player/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        }

        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device) return Response.json({ error: "Não autorizado." }, { status: 401 });

        let body: z.infer<typeof bodySchema> = {};
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          body = {};
        }

        const { and, eq } = await import("drizzle-orm");
        const { resolvePlaylistForDevice } = await import(
          "@/lib/player/schedule-resolver.server"
        );
        const db = getDb();

        await db
          .update(schema.devices)
          .set({
            lastSeenAt: new Date(),
            ...(body.appVersion ? { appVersion: body.appVersion } : {}),
          })
          .where(eq(schema.devices.id, device.id));

        const playlist = await resolvePlaylistForDevice(device.id);

        const commands = await db
          .select({ id: schema.deviceCommands.id, kind: schema.deviceCommands.kind })
          .from(schema.deviceCommands)
          .where(
            and(
              eq(schema.deviceCommands.deviceId, device.id),
              eq(schema.deviceCommands.status, "queued"),
            ),
          )
          .limit(20);

        if (commands.length > 0) {
          const { inArray } = await import("drizzle-orm");
          await db
            .update(schema.deviceCommands)
            .set({ status: "done", deliveredAt: new Date(), completedAt: new Date() })
            .where(
              inArray(
                schema.deviceCommands.id,
                commands.map((c) => c.id),
              ),
            );
        }

        return Response.json(
          {
            device: {
              id: device.id,
              name: device.name,
              canvasPreset: device.canvasPreset,
            },
            playlist,
            commands: commands.map((c) => c.kind),
            syncIntervalMs: 60_000,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});