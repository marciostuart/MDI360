import { createFileRoute } from "@tanstack/react-router";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newPairingCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export const Route = createFileRoute("/api/public/emitter/register")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { getDb, isDatabaseConfigured, schema } = await import("@/lib/db/index.server");
          if (!isDatabaseConfigured()) return new Response("Indisponível", { status: 503 });
          const { newEmitterToken, hashEmitterToken } = await import(
            "@/lib/queue/emitter-auth.server"
          );
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
