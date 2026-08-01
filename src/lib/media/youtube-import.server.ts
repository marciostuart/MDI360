/**
 * Background half of the YouTube import: download, convert to the standard MP4,
 * store in MinIO and only then release the item for the screens.
 */
export async function processYoutubeImport(job: {
  assetId: string;
  organizationId: string;
  videoId: string;
  storageKey: string;
  canvasPreset: string;
  quotaBytes: number;
}) {
  const { getDb, schema } = await import("@/lib/db/index.server");
  const { and, eq, sql } = await import("drizzle-orm");
  const db = getDb();

  const scope = and(
    eq(schema.mediaAssets.id, job.assetId),
    eq(schema.mediaAssets.organizationId, job.organizationId),
  );

  async function fail(message: string) {
    try {
      await db.update(schema.mediaAssets).set({ status: "failed", byteSize: 0 }).where(scope);
    } catch (error) {
      console.error("youtube import: failed to flag row", error);
    }
    try {
      const { deleteObject } = await import("@/lib/storage.server");
      await deleteObject(job.storageKey);
    } catch {
      // O objeto pode nunca ter sido criado.
    }
    console.error(`youtube import ${job.videoId}: ${message}`);
  }

  try {
    const { downloadYoutubeVideo, isYtdlpMissing } = await import("./youtube.server");
    const { transcodeVideoToStandardMp4 } = await import("./transcode.server");

    let source: Uint8Array;
    try {
      source = await downloadYoutubeVideo(job.videoId);
    } catch (error) {
      await fail(
        isYtdlpMissing(error)
          ? "yt-dlp indisponível no servidor"
          : error instanceof Error
            ? error.message
            : "download falhou",
      );
      return;
    }

    const converted = await transcodeVideoToStandardMp4(source, job.canvasPreset);
    const bytes = converted.body.byteLength;

    // Atomic quota check with the real size: an import can never push the
    // organization above its plan.
    const updated = await db.execute(sql`
      update media_assets set byte_size = ${bytes}
      where id = ${job.assetId}::uuid
        and organization_id = ${job.organizationId}::uuid
        and (
          select coalesce(sum(byte_size), 0) from media_assets
          where organization_id = ${job.organizationId}::uuid and id <> ${job.assetId}::uuid
        ) + ${bytes} <= ${job.quotaBytes}
      returning id
    `);
    const rowCount = Array.isArray(updated)
      ? updated.length
      : ((updated as { rowCount?: number; rows?: unknown[] }).rowCount ??
        (updated as { rows?: unknown[] }).rows?.length ??
        0);
    if (!rowCount) {
      await fail("espaço do plano esgotado");
      return;
    }

    const { putObject } = await import("@/lib/storage.server");
    await putObject(job.storageKey, converted.body, converted.mimeType);

    await db
      .update(schema.mediaAssets)
      .set({
        status: "ready",
        mimeType: converted.mimeType,
        byteSize: bytes,
        originalByteSize: source.byteLength,
      })
      .where(scope);

    // As telas re-sincronizam e baixam o novo arquivo imediatamente.
    const { notifyOrganization } = await import("@/lib/player/realtime.server");
    notifyOrganization(job.organizationId);
  } catch (error) {
    await fail(error instanceof Error ? error.message : "erro inesperado");
  }
}
