import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  playlistId: z.string().uuid().nullish(),
  mediaAssetId: z.string().uuid().nullish(),
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
  completed: z.boolean().optional(),
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

        await getDb()
          .insert(schema.playbackEvents)
          .values({
            organizationId: device.organizationId,
            deviceId: device.id,
            playlistId: body.playlistId ?? null,
            mediaAssetId: body.mediaAssetId ?? null,
            startedAt: new Date(),
            durationMs: body.durationMs ?? 0,
            completed: body.completed ?? true,
          });

        return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
