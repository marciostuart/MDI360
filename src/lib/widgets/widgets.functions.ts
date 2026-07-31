import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { widgetConfigSchema } from "./catalog";

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
    const { and, eq } = await import("drizzle-orm");
    const user = await requireUser();
    const db = getDb();

    if (data.assetId) {
      await db
        .update(schema.mediaAssets)
        .set({ name: data.name, widgetType: data.config.type, widgetConfig: data.config })
        .where(
          and(
            eq(schema.mediaAssets.id, data.assetId),
            eq(schema.mediaAssets.organizationId, user.organizationId),
            eq(schema.mediaAssets.kind, "widget"),
          ),
        );
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
        createdBy: user.id,
      })
      .returning({ id: schema.mediaAssets.id });

    return { id: inserted[0]!.id };
  });
