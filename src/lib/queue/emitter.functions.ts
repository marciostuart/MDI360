import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, "Informe o código de 6 caracteres exibido no terminal.");

export type QueueEmitterRow = {
  id: string;
  name: string;
  lastSeenAt: string | null;
};

/** Links the code displayed by an emitter to one queue panel owned by the user. */
export const claimEmitter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ panelId: z.string().uuid(), code: codeSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, gt, isNull } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const panel = await db.query.queuePanels.findFirst({
      columns: { id: true },
      where: and(
        eq(schema.queuePanels.id, data.panelId),
        eq(schema.queuePanels.organizationId, user.organizationId),
      ),
    });
    if (!panel) throw new Error("Painel de senhas não encontrado.");

    const claimed = await db
      .update(schema.queueEmitters)
      .set({
        organizationId: user.organizationId,
        panelId: panel.id,
        pairingCode: null,
        pairingExpiresAt: null,
      })
      .where(
        and(
          eq(schema.queueEmitters.pairingCode, data.code),
          gt(schema.queueEmitters.pairingExpiresAt, new Date()),
          isNull(schema.queueEmitters.organizationId),
          isNull(schema.queueEmitters.panelId),
        ),
      )
      .returning({ id: schema.queueEmitters.id });

    if (!claimed[0]) {
      throw new Error("Código inválido, expirado ou já utilizado. Confira o terminal.");
    }
    return { ok: true } as const;
  });

/** Lists desktop emitters linked to a panel without exposing their token hashes. */
export const listEmitters = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ panelId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, asc, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const rows = await getDb()
      .select({
        id: schema.queueEmitters.id,
        name: schema.queueEmitters.name,
        lastSeenAt: schema.queueEmitters.lastSeenAt,
      })
      .from(schema.queueEmitters)
      .innerJoin(schema.queuePanels, eq(schema.queuePanels.id, schema.queueEmitters.panelId))
      .where(
        and(
          eq(schema.queueEmitters.panelId, data.panelId),
          eq(schema.queuePanels.organizationId, user.organizationId),
        ),
      )
      .orderBy(asc(schema.queueEmitters.createdAt));

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      })) satisfies QueueEmitterRow[],
    };
  });

/** Disconnects one emitter; the app will automatically register and show a new code. */
export const removeEmitter = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ panelId: z.string().uuid(), emitterId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    await getDb()
      .delete(schema.queueEmitters)
      .where(
        and(
          eq(schema.queueEmitters.id, data.emitterId),
          eq(schema.queueEmitters.panelId, data.panelId),
          eq(schema.queueEmitters.organizationId, user.organizationId),
        ),
      );
    return { ok: true } as const;
  });
