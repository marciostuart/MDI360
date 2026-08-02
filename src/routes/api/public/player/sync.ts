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
        try {
        const { recordTraffic } = await import("@/lib/admin/traffic.server");
        try {
          recordTraffic(0, 0);
        } catch {
          // Metrics must never break playback.
        }
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

        // Queue add-on: pending ticket calls for this screen, oldest first. The
        // player plays them one at a time, respecting each display time.
        const { recentQueueCalls } = await import("@/lib/queue/current-call.server");
        let queueCalls: Awaited<ReturnType<typeof recentQueueCalls>> = [];
        try {
          queueCalls = await recentQueueCalls(device.id);
        } catch {
          queueCalls = [];
        }
        // Kept for players installed before the queue became a list.
        const queueCall = queueCalls.length > 0 ? queueCalls[queueCalls.length - 1] : null;

        let revision = 0;
        try {
          const { revisionFor } = await import("@/lib/player/realtime.server");
          revision = revisionFor(device.id, device.organizationId);
        } catch {
          revision = 0;
        }

        // Whitelabel branding of the organization that owns this screen.
        let branding: {
          name: string | null;
          splashText: string | null;
          color: string | null;
          logoUrl: string | null;
        } | null = null;
        if (device.organizationId) {
          const orgRows = await db
            .select({
              name: schema.organizations.name,
              splashText: schema.organizations.brandSplashText,
              color: schema.organizations.brandColor,
              logoKey: schema.organizations.brandLogoKey,
            })
            .from(schema.organizations)
            .where(eq(schema.organizations.id, device.organizationId))
            .limit(1);
          const org = orgRows[0];
          if (org) {
            let logoUrl: string | null = null;
            if (org.logoKey) {
              try {
                const { createDownloadUrl } = await import("@/lib/storage.server");
                logoUrl = await createDownloadUrl(org.logoKey, 7200);
              } catch {
                logoUrl = null;
              }
            }
            branding = {
              name: org.name,
              splashText: org.splashText,
              color: org.color,
              logoUrl,
            };
          }
        }

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
              audioEnabled: device.audioEnabled,
              transitionEffect: device.transitionEffect,
              screenWidth: device.screenWidth,
              screenHeight: device.screenHeight,
            },
            playlist,
            branding,
            queueCall,
            queueCalls,
            commands: commands.map((c) => c.kind),
            syncIntervalMs: 60_000,
            // Seed for the long-poll channel (/api/public/player/events).
            revision,
          },
          { headers: { "cache-control": "no-store" } },
        );
        } catch (cause) {
          console.error("[player/sync] falha inesperada:", cause);
          return Response.json({ error: "Falha ao sincronizar." }, { status: 500 });
        }
      },
    },
  },
});