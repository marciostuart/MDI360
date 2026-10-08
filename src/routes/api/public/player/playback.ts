import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  isPlaybackTimeValid,
  playbackEventValues,
  playbackReportSchema,
} from "@/lib/player/playback-report";

const bodySchema = z.union([
  playbackReportSchema,
  z.object({ events: z.array(playbackReportSchema).min(1).max(100) }),
]);

/**
 * A screen reports each item it starts showing. The endpoint accepts the
 * original single-event shape and a batch shape so older players remain
 * compatible while current players reduce HTTP and database overhead.
 */
export const Route = createFileRoute("/api/public/player/playback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Servi\u00e7o indispon\u00edvel." }, { status: 503 });
        }

        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device || !device.organizationId) {
          return Response.json({ error: "N\u00e3o autorizado." }, { status: 401 });
        }

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Dados inv\u00e1lidos." }, { status: 400 });
        }

        const events = "events" in body ? body.events : [body];
        const db = getDb();
        let accepted = 0;
        let rejected = 0;

        for (const event of events) {
          const startedAt = event.startedAt ? new Date(event.startedAt) : new Date();
          if (!isPlaybackTimeValid(startedAt, Date.now())) {
            rejected += 1;
            continue;
          }

          const normalized = { ...event };
          if (normalized.mediaAssetId) {
            const asset = await db
              .select({ id: schema.mediaAssets.id })
              .from(schema.mediaAssets)
              .where(
                and(
                  eq(schema.mediaAssets.id, normalized.mediaAssetId),
                  eq(schema.mediaAssets.organizationId, device.organizationId),
                ),
              )
              .limit(1);
            if (!asset.length) normalized.mediaAssetId = null;
          }
          if (normalized.playlistId) {
            const playlist = await db
              .select({ id: schema.playlists.id })
              .from(schema.playlists)
              .where(
                and(
                  eq(schema.playlists.id, normalized.playlistId),
                  eq(schema.playlists.organizationId, device.organizationId),
                ),
              )
              .limit(1);
            if (!playlist.length) normalized.playlistId = null;
          }

          if (normalized.eventId) {
            const values = playbackEventValues(
              normalized,
              { id: device.id, organizationId: device.organizationId },
              startedAt,
            );
            await db
              .insert(schema.playbackEvents)
              .values(values)
              .onConflictDoNothing({ target: schema.playbackEvents.id });
            if (normalized.completed) {
              await db
                .update(schema.playbackEvents)
                .set({
                  durationMs: sql`greatest(${schema.playbackEvents.durationMs}, ${normalized.durationMs ?? 0})`,
                  completed: true,
                })
                .where(
                  and(
                    eq(schema.playbackEvents.id, normalized.eventId),
                    eq(schema.playbackEvents.deviceId, device.id),
                    eq(schema.playbackEvents.startedAt, startedAt),
                  ),
                );
            }
            const acceptedEvent = await db
              .select({ id: schema.playbackEvents.id })
              .from(schema.playbackEvents)
              .where(
                and(
                  eq(schema.playbackEvents.id, normalized.eventId),
                  eq(schema.playbackEvents.deviceId, device.id),
                  eq(schema.playbackEvents.startedAt, startedAt),
                ),
              )
              .limit(1);
            if (!acceptedEvent.length) {
              rejected += 1;
              continue;
            }
            accepted += 1;
            continue;
          }

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
            await db.insert(schema.playbackEvents).values({
              organizationId: device.organizationId,
              deviceId: device.id,
              playlistId: normalized.playlistId ?? null,
              mediaAssetId: normalized.mediaAssetId ?? null,
              startedAt,
              durationMs: normalized.durationMs ?? 0,
              completed: normalized.completed ?? true,
            });
          }
          accepted += 1;
        }

        return Response.json(
          { ok: true, accepted, rejected },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
