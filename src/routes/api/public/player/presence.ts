import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  playlistId: z.string().uuid().nullable(),
  playlistItemId: z.string().uuid().nullable(),
  mediaAssetId: z.string().uuid().nullable(),
  mediaKind: z.string().trim().max(32).nullable(),
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

        await getDb()
          .update(schema.devices)
          .set({
            lastSeenAt: new Date(),
            currentPlaylistId: body.playlistId,
            currentPlaylistItemId: body.playlistItemId,
            currentPlaylistName: null,
            currentMediaAssetId: body.mediaAssetId,
            currentMediaName: null,
            currentMediaKind: body.mediaKind,
            currentPlaybackStartedAt: body.startedAt ? new Date(body.startedAt) : null,
            currentPlaybackEndedAt: body.endedAt ? new Date(body.endedAt) : null,
          })
          .where(
            and(
              eq(schema.devices.id, device.id),
              eq(schema.devices.organizationId, device.organizationId),
            ),
          );

        return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
