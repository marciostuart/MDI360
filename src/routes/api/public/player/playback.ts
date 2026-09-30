import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  playlistId: z.string().uuid().nullish(),
  mediaAssetId: z.string().uuid().nullish(),
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
  completed: z.boolean().optional(),
  /** Horario original no terminal; usado para sincronizar exibicoes offline. */
  startedAt: z.string().datetime({ offset: true }).optional(),
});

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
        if (
          Number.isNaN(startedAt.getTime()) ||
          startedAt.getTime() > now + 5 * 60_000 ||
          startedAt.getTime() < now - 31 * 24 * 60 * 60_000
        ) {
          return Response.json({ error: "Horario de exibicao invalido." }, { status: 400 });
        }

        const db = getDb();
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
