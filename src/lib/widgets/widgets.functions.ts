import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { widgetConfigSchema } from "./catalog";
import { lotteryDurationMs } from "./lottery";

const saveSchema = z.object({
  assetId: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Informe um nome").max(160),
  config: widgetConfigSchema,
});

/**
 * Creates or updates an information widget. Widgets live in the same library as
 * files (kind "widget") and are always scoped to the caller's organization.
 */
export const saveWidgetAsset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data }) => {
    const { getDb, schema, isDatabaseConfigured } = await import("@/lib/db/index.server");
    if (!isDatabaseConfigured()) throw new Error("Banco de dados não configurado.");

    const { requireUser } = await import("@/lib/auth/session.server");
    const { and, eq, inArray, sql } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    if (data.assetId) {
      const durationMs =
        data.config.type === "lottery" ? lotteryDurationMs(data.config) : undefined;
      await db.transaction(async (tx) => {
        await tx
          .update(schema.mediaAssets)
          .set({
            name: data.name,
            widgetType: data.config.type,
            widgetConfig: data.config,
            ...(durationMs ? { durationMs } : {}),
          })
          .where(
            and(
              eq(schema.mediaAssets.id, data.assetId!),
              eq(schema.mediaAssets.organizationId, user.organizationId),
              eq(schema.mediaAssets.kind, "widget"),
            ),
          );
        if (durationMs) {
          const affected = await tx
            .update(schema.playlistItems)
            .set({ durationMs })
            .where(eq(schema.playlistItems.mediaAssetId, data.assetId!))
            .returning({ playlistId: schema.playlistItems.playlistId });
          const playlistIds = [...new Set(affected.map((row) => row.playlistId))];
          if (playlistIds.length) {
            await tx
              .update(schema.playlists)
              .set({ revision: sql`${schema.playlists.revision} + 1`, updatedAt: new Date() })
              .where(
                and(
                  inArray(schema.playlists.id, playlistIds),
                  eq(schema.playlists.organizationId, user.organizationId),
                ),
              );
          }
        }
      });
      const { notifyOrganization } = await import("@/lib/player/realtime.server");
      notifyOrganization(user.organizationId);
      return { id: data.assetId };
    }

    const inserted = await db
      .insert(schema.mediaAssets)
      .values({
        organizationId: user.organizationId,
        name: data.name,
        kind: "widget",
        status: "ready",
        widgetType: data.config.type,
        widgetConfig: data.config,
        durationMs: data.config.type === "lottery" ? lotteryDurationMs(data.config) : undefined,
        createdBy: user.id,
      })
      .returning({ id: schema.mediaAssets.id });

    return { id: inserted[0]!.id };
  });
