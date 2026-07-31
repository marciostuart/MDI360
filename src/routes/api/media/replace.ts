import { createFileRoute } from "@tanstack/react-router";

/**
 * Substitui o conteúdo de um arquivo existente mantendo o mesmo id. Todas as
 * playlists que já usam o arquivo passam a exibir a nova versão sem qualquer
 * edição — só o objeto no armazenamento troca (com chave nova, para invalidar
 * o cache local das TVs).
 */
export const Route = createFileRoute("/api/media/replace")({
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

        const { MAX_VIDEO_BYTES, MAX_OPTIMIZED_IMAGE_BYTES } = await import(
          "@/lib/media/presets"
        );
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (!declared || Number.isNaN(declared)) {
          return Response.json({ error: "Envio inválido." }, { status: 411 });
        }
        if (declared > MAX_VIDEO_BYTES + 1024 * 1024) {
          return Response.json({ error: "Arquivo acima do limite permitido." }, { status: 413 });
        }

        const form = await request.formData();
        const assetId = String(form.get("assetId") ?? "");
        const file = form.get("file");
        const width = Number(form.get("width") ?? 0) || null;
        const height = Number(form.get("height") ?? 0) || null;
        const durationRaw = Number(form.get("durationMs") ?? 0);
        const durationMs = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null;
        const originalByteSize = Number(form.get("originalByteSize") ?? 0) || null;
        const kind = String(form.get("kind") ?? "");
        if (!assetId || !(file instanceof File) || (kind !== "image" && kind !== "video")) {
          return Response.json({ error: "Envio inválido." }, { status: 400 });
        }

        const { getDb, schema } = await import("@/lib/db/index.server");
        const { and, eq, sql } = await import("drizzle-orm");
        const db = getDb();

        const scope = and(
          eq(schema.mediaAssets.id, assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        );

        const rows = await db
          .select({
            storageKey: schema.mediaAssets.storageKey,
            byteSize: schema.mediaAssets.byteSize,
            kind: schema.mediaAssets.kind,
            canvasPreset: schema.mediaAssets.canvasPreset,
          })
          .from(schema.mediaAssets)
          .where(scope)
          .limit(1);

        const row = rows[0];
        if (!row) return Response.json({ error: "Conteúdo não encontrado." }, { status: 404 });
        if (row.kind !== kind) {
          return Response.json(
            {
              error:
                row.kind === "video"
                  ? "Este item é um vídeo: envie outro vídeo para substituí-lo."
                  : "Este item é uma imagem: envie outra imagem para substituí-la.",
            },
            { status: 409 },
          );
        }
        const perFileLimit = kind === "image" ? MAX_OPTIMIZED_IMAGE_BYTES : MAX_VIDEO_BYTES;
        if (file.size > perFileLimit) {
          return Response.json({ error: "Arquivo acima do limite permitido." }, { status: 413 });
        }

        // Cota: só o delta entre o arquivo antigo e o novo é cobrado.
        const { getOrgLimits } = await import("@/lib/admin/limits.server");
        const limits = await getOrgLimits(user.organizationId);
        if (limits.expired || limits.subscriptionStatus === "suspended") {
          return Response.json({ error: "Assinatura inativa." }, { status: 402 });
        }
        const usedRows = await db
          .select({ used: sql<number>`coalesce(sum(byte_size), 0)::bigint` })
          .from(schema.mediaAssets)
          .where(eq(schema.mediaAssets.organizationId, user.organizationId));
        const used = Number(usedRows[0]?.used ?? 0);
        const quota = limits.maxStorageMb * 1024 * 1024;
        if (used - (row.byteSize ?? 0) + file.size > quota) {
          return Response.json(
            {
              error: `Espaço esgotado: seu plano tem ${limits.maxStorageMb} MB. Remova arquivos ou faça upgrade.`,
            },
            { status: 413 },
          );
        }

        const { randomUUID } = await import("node:crypto");
        const extension = kind === "video" ? "mp4" : (file.name.split(".").pop() ?? "webp");
        let newKey = `org/${user.organizationId}/media/${assetId}-${randomUUID().slice(0, 8)}.${extension}`;
        let mimeType = file.type || (kind === "video" ? "video/mp4" : "image/webp");
        let storedBytes = file.size;

        try {
          const { putObject } = await import("@/lib/storage.server");
          let body = new Uint8Array(await file.arrayBuffer());

          if (kind === "video") {
            const { transcodeVideoToStandardMp4, isFfmpegMissing } = await import(
              "@/lib/media/transcode.server"
            );
            try {
              const converted = await transcodeVideoToStandardMp4(body, row.canvasPreset);
              body = converted.body;
              mimeType = converted.mimeType;
              storedBytes = body.byteLength;
            } catch (error) {
              if (!isFfmpegMissing(error)) {
                console.error("replace transcode failed", error);
                return Response.json(
                  { error: "Não foi possível converter este vídeo. Envie um MP4/WebM válido." },
                  { status: 422 },
                );
              }
              newKey = newKey.replace(/\.mp4$/, ".mp4");
            }
          }

          await putObject(newKey, body as Uint8Array<ArrayBuffer>, mimeType);
        } catch (error) {
          console.error("media replace failed", error);
          return Response.json(
            { error: "Não foi possível salvar o arquivo no armazenamento. Tente novamente." },
            { status: 502 },
          );
        }

        await db
          .update(schema.mediaAssets)
          .set({
            storageKey: newKey,
            mimeType,
            byteSize: storedBytes,
            originalByteSize: originalByteSize ?? storedBytes,
            width: width ?? null,
            height: height ?? null,
            durationMs,
            status: "ready",
          })
          .where(scope);

        // O objeto antigo só sai depois que o novo já está salvo e apontado.
        if (row.storageKey && row.storageKey !== newKey) {
          const { deleteObject, isStorageConfigured } = await import("@/lib/storage.server");
          if (isStorageConfigured()) {
            try {
              await deleteObject(row.storageKey);
            } catch (error) {
              console.error("failed to delete replaced object", error);
            }
          }
        }

        const { recordTraffic } = await import("@/lib/admin/traffic.server");
        recordTraffic(storedBytes, 0);
        const { notifyOrganization } = await import("@/lib/player/realtime.server");
        notifyOrganization(user.organizationId);

        return Response.json({ ok: true });
      },
    },
  },
});
