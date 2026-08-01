import { createFileRoute } from "@tanstack/react-router";

/**
 * Custom call tone of a queue panel, streamed same-origin so the player can
 * route it through Web Audio (a signed MinIO URL would taint the audio graph).
 * Keyed by the panel UUID: unguessable and it only exposes the tone itself.
 */
export const Route = createFileRoute("/api/public/player/chime")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) return new Response("unavailable", { status: 503 });

        const url = new URL(request.url);
        const panelId = url.searchParams.get("panel") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(panelId)) return new Response("bad request", { status: 400 });

        const { eq } = await import("drizzle-orm");
        const rows = await getDb()
          .select({ key: schema.queuePanels.chimeStorageKey })
          .from(schema.queuePanels)
          .where(eq(schema.queuePanels.id, panelId))
          .limit(1);

        const key = rows[0]?.key;
        if (!key) return new Response("not found", { status: 404 });

        const { getObjectBytes, isStorageConfigured } = await import("@/lib/storage.server");
        if (!isStorageConfigured()) return new Response("unavailable", { status: 503 });

        try {
          const object = await getObjectBytes(key);
          if (!object) return new Response("not found", { status: 404 });
          const body = object.bytes.slice().buffer as ArrayBuffer;
          return new Response(body, {
            headers: {
              "content-type": object.contentType || "audio/mpeg",
              "content-length": String(object.bytes.byteLength),
              "cache-control": "public, max-age=300",
            },
          });
        } catch {
          return new Response("not found", { status: 404 });
        }
      },
    },
  },
});
