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

        // Storage quota: block the write before it reaches MinIO.
        const { getOrgLimits } = await import("@/lib/admin/limits.server");
        const limits = await getOrgLimits(user.organizationId);
        const quotaBytes = limits.maxStorageMb * 1024 * 1024;
        if (limits.expired || limits.subscriptionStatus === "suspended") {
          return Response.json(
            { error: "Assinatura inativa. Fale com o suporte para reativar sua conta." },
            { status: 402 },
          );
        }
        if (limits.usedStorageBytes + file.size > quotaBytes) {
          return Response.json(
            {
              error: `Espaço esgotado: seu plano tem ${limits.maxStorageMb} MB. Remova arquivos ou faça upgrade.`,
            },
            { status: 413 },
          );
        }

        const scope = and(
          eq(schema.mediaAssets.id, assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        );

        try {
          const { putObject } = await import("@/lib/storage.server");
          const body = new Uint8Array(await file.arrayBuffer());
          await putObject(row.storageKey, body, row.mimeType ?? file.type ?? undefined);
        } catch (error) {
          const detail = describeStorageError(error);
          console.error("media upload failed", detail);
          await db.update(schema.mediaAssets).set({ status: "failed" }).where(scope);
          return Response.json({ error: `MinIO recusou o arquivo: ${detail}` }, { status: 502 });
        }

        await db.update(schema.mediaAssets).set({ status: "ready" }).where(scope);

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
