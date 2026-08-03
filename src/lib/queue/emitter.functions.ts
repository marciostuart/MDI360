import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Gera um código de pareamento de 6 caracteres para o impressor.
 */
export const requestEmitterPairing = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ panelId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const panel = await db.query.queuePanels.findFirst({
      where: and(
        eq(schema.queuePanels.id, data.panelId),
        eq(schema.queuePanels.organizationId, user.organizationId)
      ),
    });
    if (!panel) throw new Error("Painel não encontrado.");

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    await db.update(schema.queuePanels)
      .set({ emitterPairingCode: code, emitterPairingExpiresAt: expiresAt })
      .where(eq(schema.queuePanels.id, panel.id));

    return { code, expiresAt: expiresAt.toISOString() };
  });

/**
 * Autentica o impressor via código de pareamento.
 * Retorna o token definitivo se o código for válido.
 */
export const pairEmitter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().length(6).toUpperCase() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq, gt } = await import("drizzle-orm");
    const db = getDb();

    const panel = await db.query.queuePanels.findFirst({
      where: and(
        eq(schema.queuePanels.emitterPairingCode, data.code),
        gt(schema.queuePanels.emitterPairingExpiresAt, new Date())
      ),
    });

    if (!panel) throw new Error("Código inválido ou expirado.");

    // Ao parear, limpamos o código e retornamos o token (kioskToken).
    // O kioskToken já serve como segredo de autenticação para o spool.
    await db.update(schema.queuePanels)
      .set({ emitterPairingCode: null, emitterPairingExpiresAt: null })
      .where(eq(schema.queuePanels.id, panel.id));

    return { token: panel.kioskToken };
  });
