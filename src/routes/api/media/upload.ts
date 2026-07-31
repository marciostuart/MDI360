import { createFileRoute } from "@tanstack/react-router";

/**
 * Server-side upload proxy. The browser posts the optimized file here and the
 * server streams it into MinIO using the internal endpoint. This removes the
 * browser->MinIO CORS/signature surface entirely and lets us return the real
 * storage error instead of an opaque "failed to fetch".
 */
export const Route = createFileRoute("/api/media/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireUser } = await import("@/lib/auth/session.server");
        let user;
        try {
          user = await requireUser();
        } catch {
          return Response.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
        }

        // Hard ceiling checked *before* parsing the body, so an oversized or
        // lying client can never make us buffer hundreds of MB in memory.
        const { MAX_VIDEO_BYTES } = await import("@/lib/media/presets");
        const ABSOLUTE_MAX = MAX_VIDEO_BYTES + 1024 * 1024; // + multipart overhead
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (!declared || Number.isNaN(declared)) {
          return Response.json({ error: "Envio inválido." }, { status: 411 });
        }
        if (declared > ABSOLUTE_MAX) {
          return Response.json({ error: "Arquivo acima do limite permitido." }, { status: 413 });
        }

        const form = await request.formData();
        const assetId = String(form.get("assetId") ?? "");
        const file = form.get("file");
        if (!assetId || !(file instanceof File)) {
          return Response.json({ error: "Envio inválido." }, { status: 400 });
        }

        const { getDb, schema } = await import("@/lib/db/index.server");
        const { and, eq } = await import("drizzle-orm");
        const db = getDb();

        const rows = await db
          .select({
            storageKey: schema.mediaAssets.storageKey,
            mimeType: schema.mediaAssets.mimeType,
            byteSize: schema.mediaAssets.byteSize,
            status: schema.mediaAssets.status,
          })
          .from(schema.mediaAssets)
          .where(
            and(
              eq(schema.mediaAssets.id, assetId),
              eq(schema.mediaAssets.organizationId, user.organizationId),
            ),
          )
          .limit(1);

        const row = rows[0];
        if (!row?.storageKey) {
          return Response.json({ error: "Conteúdo não encontrado." }, { status: 404 });
        }

        const scope = and(
          eq(schema.mediaAssets.id, assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        );

        // The quota was already reserved when the ticket row was created with
        // this exact size. Refuse anything bigger than the reservation so the
        // stored bytes always match what we charged against the plan.
        const reserved = row.byteSize ?? 0;
        if (!reserved || file.size > reserved) {
          await db.delete(schema.mediaAssets).where(scope);
          return Response.json(
            { error: "Arquivo diferente do informado no envio. Tente novamente." },
            { status: 409 },
          );
        }
        if (row.status === "ready") {
          return Response.json({ error: "Este conteúdo já foi enviado." }, { status: 409 });
        }

        try {
          const { putObject } = await import("@/lib/storage.server");
          const body = new Uint8Array(await file.arrayBuffer());
          await putObject(row.storageKey, body, row.mimeType ?? file.type ?? undefined);
        } catch (error) {
          const detail = describeStorageError(error);
          console.error("media upload failed", detail);
          // Drop the row so the reserved quota is released instead of leaking.
          await db.delete(schema.mediaAssets).where(scope);
          return Response.json(
            { error: "Não foi possível salvar o arquivo no armazenamento. Tente novamente." },
            { status: 502 },
          );
        }

        await db
          .update(schema.mediaAssets)
          .set({ status: "ready", byteSize: file.size })
          .where(scope);

        const { recordTraffic } = await import("@/lib/admin/traffic.server");
        recordTraffic(file.size, 0);

        return Response.json({ ok: true });
      },
    },
  },
});

function describeStorageError(error: unknown): string {
  const err = error as {
    name?: string;
    message?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return [
    err?.name ?? "Erro",
    err?.Code ? `code=${err.Code}` : undefined,
    err?.$metadata?.httpStatusCode ? `http=${err.$metadata.httpStatusCode}` : undefined,
    err?.message,
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 300);
}
