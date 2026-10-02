import { createFileRoute } from "@tanstack/react-router";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newPairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export const Route = createFileRoute("/api/public/emitter/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { getDb, isDatabaseConfigured, schema } = await import("@/lib/db/index.server");
          if (!isDatabaseConfigured()) return new Response("Indisponível", { status: 503 });
          const { newEmitterToken, hashEmitterToken, bearerToken } = await import(
            "@/lib/queue/emitter-auth.server"
          );
          // A retry carrying the existing secret must not replace a valid code.
          const previousToken = bearerToken(request);
          if (previousToken) {
            const { eq } = await import("drizzle-orm");
            const existing = await getDb().query.queueEmitters.findFirst({
              columns: { pairingCode: true, pairingExpiresAt: true },
              where: eq(schema.queueEmitters.tokenHash, hashEmitterToken(previousToken)),
            });
            if (existing?.pairingCode && existing.pairingExpiresAt && existing.pairingExpiresAt > new Date()) {
              return Response.json({ emitterToken: previousToken, pairingCode: existing.pairingCode, expiresAt: existing.pairingExpiresAt.toISOString() }, { headers: { "cache-control": "no-store" } });
            }
          }
          const token = newEmitterToken();
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

          for (let attempt = 0; attempt < 12; attempt += 1) {
            const pairingCode = newPairingCode();
            try {
              await getDb().insert(schema.queueEmitters).values({
                pairingCode,
                pairingExpiresAt: expiresAt,
                tokenHash: hashEmitterToken(token),
              });
              return Response.json(
                { emitterToken: token, pairingCode, expiresAt: expiresAt.toISOString() },
                { headers: { "cache-control": "no-store" } },
              );
            } catch (error) {
              if ((error as { code?: string }).code !== "23505") throw error;
            }
          }
          return new Response("Não foi possível gerar o código", { status: 503 });
        } catch (error) {
          console.error("[emitter-register] falha ao registrar terminal", error);
          return new Response("Erro interno", { status: 500 });
        }
      },
    },
  },
});
