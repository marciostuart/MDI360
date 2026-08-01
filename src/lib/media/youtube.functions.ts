import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CANVAS_PRESET_IDS, MAX_VIDEO_DURATION_MS } from "./presets";

const importSchema = z.object({
  url: z.string().trim().min(5, "Informe o link do vídeo").max(400),
  name: z.string().trim().max(160).optional(),
  canvasPreset: z.enum(CANVAS_PRESET_IDS as [string, ...string[]]),
});

/**
 * Imports a YouTube video as a regular MP4 file in the library.
 *
 * The download + conversion runs in the background so the panel never waits on
 * a long request. The row appears immediately with status "uploading" and flips
 * to "ready" (or "failed") when the pipeline finishes. From that moment on the
 * item behaves exactly like an uploaded video: no YouTube player, no controls or
 * end screens, audio follows the item/TV setting, the TVs cache it locally and
 * wipe it when the content is deleted.
 */
export const importYoutubeVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => importSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");
    const { isStorageConfigured } = await import("@/lib/storage.server");
    if (!isStorageConfigured()) throw new Error("Armazenamento (MinIO) não configurado.");

    const { requireUser } = await import("@/lib/auth/session.server");
    const { randomUUID } = await import("node:crypto");
    const user = await requireUser();

    const { parseYoutubeId, watchUrl, fetchYoutubeMetadata, isYtdlpMissing } = await import(
      "./youtube.server"
    );
    const videoId = parseYoutubeId(data.url);
    if (!videoId) throw new Error("Link inválido. Cole o endereço do vídeo no YouTube.");

    const { getOrgLimits } = await import("@/lib/admin/limits.server");
    const limits = await getOrgLimits(user.organizationId);
    if (limits.expired || limits.subscriptionStatus === "suspended") {
      throw new Error("Assinatura inativa. Fale com o suporte para reativar sua conta.");
    }

    let metadata: { title: string; durationMs: number | null };
    try {
      metadata = await fetchYoutubeMetadata(videoId);
    } catch (error) {
      if (isYtdlpMissing(error)) {
        throw new Error(
          "O servidor ainda não tem o importador do YouTube instalado. Refaça o deploy da imagem mais recente.",
        );
      }
      throw error;
    }

    if (metadata.durationMs && metadata.durationMs > MAX_VIDEO_DURATION_MS) {
      throw new Error("O vídeo passa de 10 minutos. Escolha um vídeo mais curto.");
    }

    const db = getDb();
    const assetId = randomUUID();
    const storageKey = `org/${user.organizationId}/media/${assetId}.mp4`;
    const name = (data.name?.trim() || metadata.title).slice(0, 160);

    await db.insert(schema.mediaAssets).values({
      id: assetId,
      organizationId: user.organizationId,
      name,
      kind: "video",
      status: "uploading",
      canvasPreset: data.canvasPreset,
      storageKey,
      sourceUrl: watchUrl(videoId),
      mimeType: "video/mp4",
      byteSize: 0,
      durationMs: metadata.durationMs,
      createdBy: user.id,
    });

    const { processYoutubeImport } = await import("./youtube-import.server");
    // Fire-and-forget: the panel polls the library until the row is ready.
    void processYoutubeImport({
      assetId,
      organizationId: user.organizationId,
      videoId,
      storageKey,
      canvasPreset: data.canvasPreset,
      quotaBytes: limits.maxStorageMb * 1024 * 1024,
    });

    return { assetId, name };
  });
