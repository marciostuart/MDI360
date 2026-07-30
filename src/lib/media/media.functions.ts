import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { WidgetConfig } from "@/lib/widgets/catalog";

import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  CANVAS_PRESET_IDS,
  MAX_OPTIMIZED_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_MS,
} from "./presets";

const ticketSchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome").max(160),
    kind: z.enum(["image", "video"]),
    mimeType: z.string().trim().max(120),
    extension: z.enum(["webp", "jpg", "png", "mp4", "webm"]),
    byteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
    originalByteSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
    durationMs: z.number().int().min(0).max(MAX_VIDEO_DURATION_MS).nullable(),
    canvasPreset: z.enum(CANVAS_PRESET_IDS as [string, ...string[]]),
  })
  .superRefine((value, ctx) => {
    const allowed = value.kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
    if (!allowed.includes(value.mimeType)) {
      ctx.addIssue({ code: "custom", message: "Tipo de arquivo não permitido." });
    }
    const limit = value.kind === "image" ? MAX_OPTIMIZED_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (value.byteSize > limit) {
      ctx.addIssue({ code: "custom", message: "Arquivo acima do limite permitido." });
    }
  });

export type MediaListItem = {
  id: string;
  name: string;
  kind: "image" | "video" | "web" | "widget";
  status: "uploading" | "ready" | "failed";
  canvasPreset: string;
  mimeType: string | null;
  byteSize: number | null;
  originalByteSize: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  previewUrl: string | null;
  widgetType: string | null;
  widgetConfig: WidgetConfig | null;
};

/** Library of the caller's organization. Never returns another tenant's rows. */
export const listMediaAssets = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ storageReady: boolean; items: MediaListItem[] }> => {
    const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
    const { isStorageConfigured, createDownloadUrl } = await import("@/lib/storage.server");
    if (!isDatabaseConfigured()) return { storageReady: false, items: [] };

    const { requireUser } = await import("@/lib/auth/session.server");
    const { desc, eq } = await import("drizzle-orm");
    const user = await requireUser();

    const rows = await getDb()
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.organizationId, user.organizationId))
      .orderBy(desc(schema.mediaAssets.createdAt))
      .limit(200);

    const storageReady = isStorageConfigured();

    const items = await Promise.all(
      rows.map(async (row) => {
        let previewUrl: string | null = null;
        if (storageReady && row.storageKey && row.status === "ready") {
          try {
            previewUrl = await createDownloadUrl(row.storageKey, 900);
          } catch {
            previewUrl = null;
          }
        }
        return {
          id: row.id,
          name: row.name,
          kind: row.kind,
          status: row.status,
          canvasPreset: row.canvasPreset,
          mimeType: row.mimeType,
          byteSize: row.byteSize,
          originalByteSize: row.originalByteSize,
          durationMs: row.durationMs,
          width: row.width,
          height: row.height,
          createdAt: row.createdAt.toISOString(),
          previewUrl,
          widgetType: row.widgetType,
          widgetConfig: (row.widgetConfig as WidgetConfig | null) ?? null,
        } satisfies MediaListItem;
      }),
    );

    return { storageReady, items };
  },
);

/**
 * Creates the pending row and a short-lived signed PUT URL. The storage key is
 * generated server-side and namespaced per organization, so a client can never
 * choose where its file lands or overwrite someone else's object.
 */
export const createMediaUploadTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ticketSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");

    const { isStorageConfigured, createUploadUrl } = await import("@/lib/storage.server");
    if (!isStorageConfigured()) throw new Error("Armazenamento (MinIO) não configurado.");

    const { requireUser } = await import("@/lib/auth/session.server");
    const { randomUUID } = await import("node:crypto");
    const user = await requireUser();

    const assetId = randomUUID();
    const storageKey = `org/${user.organizationId}/media/${assetId}.${data.extension}`;

    await getDb().insert(schema.mediaAssets).values({
      id: assetId,
      organizationId: user.organizationId,
      name: data.name,
      kind: data.kind,
      status: "uploading",
      canvasPreset: data.canvasPreset,
      storageKey,
      mimeType: data.mimeType,
      byteSize: data.byteSize,
      originalByteSize: data.originalByteSize,
      durationMs: data.durationMs ?? null,
      width: data.width,
      height: data.height,
      createdBy: user.id,
    });

    const uploadUrl = await createUploadUrl(storageKey, data.mimeType, 900);
    return { assetId, uploadUrl };
  });

export const confirmMediaUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ assetId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();

    await getDb()
      .update(schema.mediaAssets)
      .set({ status: "ready" })
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      );

    return { ok: true };
  });

export const deleteMediaAsset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ assetId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { deleteObject, isStorageConfigured } = await import("@/lib/storage.server");
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    const rows = await db
      .select({ storageKey: schema.mediaAssets.storageKey })
      .from(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return { ok: true };

    await db
      .delete(schema.mediaAssets)
      .where(
        and(
          eq(schema.mediaAssets.id, data.assetId),
          eq(schema.mediaAssets.organizationId, user.organizationId),
        ),
      );

    if (row.storageKey && isStorageConfigured()) {
      try {
        await deleteObject(row.storageKey);
      } catch (error) {
        console.error("failed to delete object", error);
      }
    }

    return { ok: true };
  });