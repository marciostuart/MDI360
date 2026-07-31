import { createFileRoute } from "@tanstack/react-router";

/**
 * MP3 of a queue announcement, fetched by the TV's audio player.
 *
 * Roku's Audio node loads a plain URL and cannot send an Authorization header,
 * so this route is keyed by the call's own UUID — unguessable, valid only for a
 * short window after the call, and it exposes nothing but the spoken sentence
 * that is already being shown on the screen.
 */
export const Route = createFileRoute("/api/public/player/announce")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) return new Response("unavailable", { status: 503 });

        const url = new URL(request.url);
        const callId = url.searchParams.get("call") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(callId)) return new Response("bad request", { status: 400 });

        const { eq } = await import("drizzle-orm");
        const rows = await getDb()
          .select({
            spokenText: schema.queueCalls.spokenText,
            calledAt: schema.queueCalls.calledAt,
          })
          .from(schema.queueCalls)
          .where(eq(schema.queueCalls.id, callId))
          .limit(1);

        const call = rows[0];
        if (!call) return new Response("not found", { status: 404 });
        if (Date.now() - call.calledAt.getTime() > 10 * 60 * 1000) {
          return new Response("expired", { status: 410 });
        }

        const { announcementMp3 } = await import("@/lib/queue/queue-tts.server");
        const bytes = await announcementMp3(call.spokenText);
        if (!bytes) return new Response("tts unavailable", { status: 502 });

        return new Response(bytes, {
          headers: {
            "content-type": "audio/mpeg",
            "content-length": String(bytes.byteLength),
            // Same sentence = same audio; let the TV reuse it.
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
