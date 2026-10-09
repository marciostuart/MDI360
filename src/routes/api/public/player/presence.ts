import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  playlistId: z.string().uuid().nullable(),
  playlistItemId: z.string().uuid().nullable(),
  mediaAssetId: z.string().uuid().nullable(),
  mediaKind: z.string().trim().max(32).nullable(),
  mediaName: z.string().trim().max(500).nullish(),
  playlistName: z.string().trim().max(240).nullish(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  endedAt: z.string().datetime({ offset: true }).nullable(),
});

export const Route = createFileRoute("/api/public/player/presence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "ServiÃ§o indisponÃ­vel." }, { status: 503 });
        }
        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device) return Response.json({ error: "NÃ£o autorizado." }, { status: 401 });

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Dados invÃ¡lidos." }, { status: 400 });
        }

        const startedAt = body.startedAt ? new Date(body.startedAt) : null;
        const db = getDb();
        const hasIdentity = Boolean(
          body.playlistId ||
            body.playlistItemId ||
            body.mediaAssetId ||
            body.mediaName ||
            body.playlistName,
        );
        // lastSeen is a heartbeat and must always advance. The current item,
        // however, is monotonic: a delayed request from the previous item is
        // not allowed to replace the item currently on screen.
        await db
          .update(schema.devices)
          .set({
            lastSeenAt: new Date(),
          })
          .where(
            and(
              eq(schema.devices.id, device.id),
              eq(schema.devices.organizationId, device.organizationId),
            ),
          );

        if (startedAt && Number.isFinite(startedAt.getTime()) && hasIdentity) {
          await db
            .update(schema.devices)
            .set({
              currentPlaylistId: body.playlistId,
              currentPlaylistItemId: body.playlistItemId,
              currentPlaylistName: body.playlistName ?? null,
              currentMediaAssetId: body.mediaAssetId,
              currentMediaName: body.mediaName ?? null,
              currentMediaKind: body.mediaKind,
              currentPlaybackStartedAt: startedAt,
              currentPlaybackEndedAt: body.endedAt ? new Date(body.endedAt) : null,
            })
            .where(
              and(
                eq(schema.devices.id, device.id),
                eq(schema.devices.organizationId, device.organizationId),
                or(
                  isNull(schema.devices.currentPlaybackStartedAt),
                  lt(schema.devices.currentPlaybackStartedAt, startedAt),
                ),
              ),
            );

          // Presence is emitted only after the browser has rendered the first
          // frame. Persist that confirmation as proof-of-play as well, using
          // the stable start timestamp as its idempotency key. This closes the
          // gap where the live monitor was correct but the playback outbox was
          // delayed or unavailable, especially for weather/clock widgets.
          const existing = await db
            .select({ id: schema.playbackEvents.id })
            .from(schema.playbackEvents)
            .where(
              and(
                eq(schema.playbackEvents.deviceId, device.id),
                eq(schema.playbackEvents.startedAt, startedAt),
              ),
            )
            .limit(1);
          if (existing.length === 0) {
            const endedAt = body.endedAt ? new Date(body.endedAt) : null;
            const durationMs = endedAt && Number.isFinite(endedAt.getTime())
              ? Math.max(0, Math.min(24 * 3600 * 1000, endedAt.getTime() - startedAt.getTime()))
              : 0;
            await db.insert(schema.playbackEvents).values({
              organizationId: device.organizationId,
              deviceId: device.id,
              playlistId: body.playlistId,
              playlistItemId: body.playlistItemId,
              mediaAssetId: body.mediaAssetId,
              mediaName: body.mediaName ?? null,
              playlistName: body.playlistName ?? null,
              startedAt,
              endedAt,
              durationMs,
              completed: false,
            });
          }
        }

        return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
