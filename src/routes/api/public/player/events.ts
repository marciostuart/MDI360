import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const playbackStateSchema = z
  .object({
    playlistId: z.string().uuid().nullable(),
    playlistItemId: z.string().uuid().nullable(),
    // Legacy labels are accepted for Android/Roku compatibility. The Web
    // player no longer sends them.
    playlistName: z.string().trim().max(240).nullable().optional(),
    mediaAssetId: z.string().uuid().nullable(),
    mediaName: z.string().trim().max(500).nullable().optional(),
    mediaKind: z.string().trim().max(32).nullable(),
    startedAt: z.string().datetime({ offset: true }).nullable(),
    endedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .nullable()
  .optional();

/**
 * Long-poll "broadcast" channel for paired screens.
 *
 * The TV keeps one request open here; the server answers instantly the moment
 * the Studio changes something for that screen (playlist, agenda, comando,
 * branding) and otherwise closes after ~25s so the connection stays healthy
 * behind Traefik/Cloudflare. One idle socket per TV is far cheaper than
 * frequent polling, and the screens keep polling periodically as a fallback.
 */
export const Route = createFileRoute("/api/public/player/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { recordTraffic } = await import("@/lib/admin/traffic.server");
        recordTraffic(0, 0);
        const { isDatabaseConfigured } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        }

        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device) return Response.json({ error: "Não autorizado." }, { status: 401 });

        // The long-poll itself is a heartbeat. A Roku/browser can remain
        // connected here for several cycles without calling /sync, so using
        // only /sync for presence makes a healthy terminal appear offline.
        try {
          const { getDb, schema } = await import("@/lib/db/index.server");
          const { eq } = await import("drizzle-orm");
          await getDb()
            .update(schema.devices)
            .set({ lastSeenAt: new Date() })
            .where(eq(schema.devices.id, device.id));
        } catch (error) {
          // Presence must never turn a healthy long-poll into a playback
          // failure when the optional monitoring write is unavailable.
          console.warn("[player/events] heartbeat indisponivel", error);
        }

        let since = 0;
        try {
          const body = (await request.json()) as { revision?: unknown; current?: unknown };
          if (typeof body?.revision === "number" && Number.isFinite(body.revision)) {
            since = Math.max(0, Math.trunc(body.revision));
          }
          const current = playbackStateSchema.safeParse(body?.current);
          if (current.success && current.data !== undefined) {
            const { getDb, schema } = await import("@/lib/db/index.server");
            const { eq } = await import("drizzle-orm");
            await getDb()
              .update(schema.devices)
              .set(
                current.data
                  ? {
                      currentPlaylistId: current.data.playlistId,
                      currentPlaylistItemId: current.data.playlistItemId,
                      currentPlaylistName: current.data.playlistName ?? null,
                      currentMediaAssetId: current.data.mediaAssetId,
                      currentMediaName: current.data.mediaName ?? null,
                      currentMediaKind: current.data.mediaKind,
                      currentPlaybackStartedAt: current.data.startedAt
                        ? new Date(current.data.startedAt)
                        : null,
                      currentPlaybackEndedAt: current.data.endedAt
                        ? new Date(current.data.endedAt)
                        : null,
                    }
                  : {
                      currentPlaylistId: null,
                      currentPlaylistItemId: null,
                      currentMediaAssetId: null,
                      currentMediaKind: null,
                      currentPlaybackStartedAt: null,
                      currentPlaybackEndedAt: null,
                    },
              )
              .where(eq(schema.devices.id, device.id));
          }
        } catch {
          since = 0;
        }

        const { effectiveRevisionFor, waitForChange } = await import("@/lib/player/realtime.server");
        await waitForChange(device.id, device.organizationId, since);
        const revision = await effectiveRevisionFor(device.id, device.organizationId);
        return Response.json(
          {
            revision,
            changed: revision > since,
            serverRevision: revision,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
