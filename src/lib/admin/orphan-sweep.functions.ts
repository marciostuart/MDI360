import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isMatureOrphanDate, orphanOrganizationId } from "./orphan-sweep-policy";

const requestSchema = z.object({
  area: z.enum(["org", "branding"]),
  organizationId: z.string().uuid().optional(),
  cursor: z.string().max(4000).optional(),
  confirmation: z.literal("LIMPAR_ORFAOS"),
  execute: z.boolean(),
});

/** Extra conservative checks for references outside the existing support inventory. */
async function isReferencedOutsideInventory(key: string) {
  const { getDb } = await import("@/lib/db/index.server");
  const { sql } = await import("drizzle-orm");
  const encoded = encodeURIComponent(key).toLowerCase();
  const raw = key.toLowerCase();
  const contains = (row: ReturnType<typeof sql.raw>) =>
    sql`(strpos(lower(to_jsonb(${row})::text), ${raw}) > 0 OR strpos(lower(to_jsonb(${row})::text), ${encoded}) > 0)`;
  const result = await getDb().execute(sql`SELECT EXISTS (
    SELECT 1 FROM media_assets t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM organizations t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM devices t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM queue_panels t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM platform_settings t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM playlists t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM playlist_items t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM schedules t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM device_commands t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM lottery_results t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM organization_news_sources t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM locations t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM queue_emitters t WHERE ${contains(sql.raw("t"))}
    UNION ALL SELECT 1 FROM queue_sectors t WHERE ${contains(sql.raw("t"))}
  ) AS referenced`);
  return result.rows[0]?.referenced !== false;
}

export const sweepOrphanStoragePage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("./admin-auth.server");
    const admin = await requirePlatformAdmin();
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { eq, isNull, and } = await import("drizzle-orm");
    const { isStorageKeyReferenced } = await import("./storage-cleanup.server");
    const { listStorageObjects, getStorageObjectIdentity, deleteStorageObjectIfUnchanged } =
      await import("@/lib/storage.server");
    const db = getDb();
    const prefix = `${data.area}/${data.organizationId ? `${data.organizationId}/` : ""}`;
    const page = await listStorageObjects(prefix, data.cursor, 25);
    let eligible = 0,
      deleted = 0,
      skipped = 0,
      failed = 0;
    for (const item of page.items) {
      const orgId = orphanOrganizationId(item.key, data.area);
      if (
        !orgId ||
        (data.organizationId && orgId !== data.organizationId) ||
        !isMatureOrphanDate(item.modifiedAt)
      ) {
        skipped++;
        continue;
      }
      let auditId: string | undefined;
      let removed = false;
      try {
        if (
          (await isStorageKeyReferenced(item.key)) ||
          (await isReferencedOutsideInventory(item.key))
        ) {
          skipped++;
          continue;
        }
        const identity = await getStorageObjectIdentity(item.key);
        if (!identity.etag || !isMatureOrphanDate(identity.modifiedAt)) {
          skipped++;
          continue;
        }
        if (
          (await isStorageKeyReferenced(item.key)) ||
          (await isReferencedOutsideInventory(item.key))
        ) {
          skipped++;
          continue;
        }
        eligible++;
        if (!data.execute) continue;
        const [audit] = await db
          .insert(schema.supportActions)
          .values({
            actorId: admin.id,
            organizationId: orgId,
            resource: "storage",
            recordId: item.key,
            action: "orphan_cleanup_attempt",
            reason: "Limpeza de órfãos confirmada na Torre",
          })
          .returning({ id: schema.supportActions.id });
        auditId = audit?.id;
        if (!auditId) throw new Error("AUDIT_NOT_RECORDED");
        await deleteStorageObjectIfUnchanged(item.key, identity.etag);
        removed = true;
        deleted++;
        await db
          .update(schema.supportActions)
          .set({ action: "orphan_cleanup_deleted" })
          .where(eq(schema.supportActions.id, auditId));
        await db
          .update(schema.storageCleanupJobs)
          .set({ deletedAt: new Date(), lastError: null })
          .where(
            and(
              eq(schema.storageCleanupJobs.storageKey, item.key),
              isNull(schema.storageCleanupJobs.deletedAt),
            ),
          );
      } catch {
        if (!removed) failed++;
        if (auditId && !removed)
          await db
            .update(schema.supportActions)
            .set({ action: "orphan_cleanup_failed" })
            .where(eq(schema.supportActions.id, auditId))
            .catch(() => undefined);
      }
    }
    return { scanned: page.items.length, eligible, deleted, skipped, failed, cursor: page.cursor };
  });

export const sweepOrphanTemporaryFiles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ confirmation: z.literal("LIMPAR_ORFAOS"), execute: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requirePlatformAdmin } = await import("./admin-auth.server");
    const admin = await requirePlatformAdmin();
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { sweepOwnedTemporaryDirectories } = await import("./orphan-temp.server");
    const { tmpdir } = await import("node:os");
    return sweepOwnedTemporaryDirectories(
      async (name) => {
        await getDb().insert(schema.supportActions).values({
          actorId: admin.id,
          resource: "local_tmp",
          recordId: name,
          action: "orphan_cleanup_attempt",
          reason: "Limpeza de temporários confirmada na Torre",
        });
      },
      tmpdir(),
      !data.execute,
    );
  });
