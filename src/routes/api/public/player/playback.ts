import { createFileRoute } from "@tanstack/react-router";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { playbackReportSchema, isPlaybackTimeValid, playbackEventValues } from "@/lib/player/playback-report";

const bodySchema = playbackReportSchema;

/**
 * A screen reports each item it starts showing. Feeds the customer playback
 * reports and the "no ar agora" live view. Device token only, never a session.
 */
export const Route = createFileRoute("/api/public/player/playback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        }

        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device || !device.organizationId) {
          return Response.json({ error: "Não autorizado." }, { status: 401 });
        }

        let body: z.infer<typeof bodySchema>;
        try {
          body = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Dados inválidos." }, { status: 400 });
        }

        const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();
        // Do not accept a corrupted device clock as a report from the far
        // future or an unbounded historic import. A temporary offline period
        // remains fully covered by this 31-day window.
        const now = Date.now();
        if (!isPlaybackTimeValid(startedAt, now)) {
          return Response.json({ error: "Horario de exibicao invalido." }, { status: 400 });
        }

        const db = getDb();
        if (body.eventId) {
          // A start and its completion share this UUID. The primary key makes
          // retries atomic, including concurrent requests after a disconnect.
          // Removed media/playlist IDs must not block an entire offline outbox;
          // cross-company IDs must never be attached to this customer's reports.
          if (body.mediaAssetId) {
            const asset = await db.select({ id: schema.mediaAssets.id }).from(schema.mediaAssets)
              .where(and(eq(schema.mediaAssets.id, body.mediaAssetId), eq(schema.mediaAssets.organizationId, device.organizationId))).limit(1);
            if (!asset.length) body.mediaAssetId = null;
          }
          if (body.playlistId) {
            const playlist = await db.select({ id: schema.playlists.id }).from(schema.playlists)
              .where(and(eq(schema.playlists.id, body.playlistId), eq(schema.playlists.organizationId, device.organizationId))).limit(1);
            if (!playlist.length) body.playlistId = null;
          }
          const values = playbackEventValues(body, { id: device.id, organizationId: device.organizationId }, startedAt);
          await db.insert(schema.playbackEvents).values(values).onConflictDoNothing({ target: schema.playbackEvents.id });
          if (body.completed) {
            await db.update(schema.playbackEvents).set({
              durationMs: sql`greatest(${schema.playbackEvents.durationMs}, ${body.durationMs ?? 0})`,
              completed: true,
            }).where(and(
              eq(schema.playbackEvents.id, body.eventId),
              eq(schema.playbackEvents.deviceId, device.id),
              eq(schema.playbackEvents.startedAt, startedAt),
            ));
          }
          const accepted = await db.select({ id: schema.playbackEvents.id }).from(schema.playbackEvents)
            .where(and(eq(schema.playbackEvents.id, body.eventId), eq(schema.playbackEvents.deviceId, device.id), eq(schema.playbackEvents.startedAt, startedAt))).limit(1);
          if (!accepted.length) return Response.json({ error: "Identificador de exibição conflitante." }, { status: 409 });
          return Response.json({ ok: true, eventId: body.eventId, startedAt: startedAt.toISOString() }, {
            headers: { "cache-control": "no-store" },
          });
        }
        // The terminal retries the same event after a network failure. The
        // original timestamp plus device is a stable idempotency key, without
        // changing the production schema during an incident fix.
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
            playlistId: body.playlistId ?? null,
            mediaAssetId: body.mediaAssetId ?? null,
            startedAt,
            durationMs: body.durationMs ?? 0,
            completed: body.completed ?? true,
          });
        }

        return Response.json(
          { ok: true, startedAt: startedAt.toISOString() },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
