import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/index.server";
import { deleteObject, isStorageConfigured } from "@/lib/storage.server";
import { storageKeyBelongsToOrganization } from "./support-resources";

// Include config JSON: old installations can contain embedded object keys.
export async function isStorageKeyReferenced(key: string) {
  const result = await getDb().execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM media_assets WHERE storage_key = ${key} OR strpos(COALESCE(widget_config::text,''), ${key}) > 0
      UNION ALL SELECT 1 FROM organizations WHERE brand_logo_key = ${key} OR strpos(brand_activation_style::text, ${key}) > 0
      UNION ALL SELECT 1 FROM devices WHERE last_screenshot_key = ${key}
      UNION ALL SELECT 1 FROM queue_panels WHERE ${key} = ANY(ARRAY[theme_bg_image_key,theme_image_key,kiosk_logo_key,kiosk_image_key,kiosk_bg_image_key,chime_storage_key])
        OR strpos(theme_layout::text, ${key}) > 0 OR strpos(kiosk_layout::text, ${key}) > 0
      UNION ALL SELECT 1 FROM platform_settings WHERE strpos(value::text, ${key}) > 0
    ) AS referenced`);
  return result.rows[0]?.referenced === true;
}

/** Durable retry after mutations; never called by playback/polling. */
export async function retryStorageCleanup(organizationId?: string, onlyKeys?: string[]) {
  if (!isStorageConfigured()) return { deleted: 0, failed: 0, skipped: 0 };
  const db = getDb();
  if (onlyKeys && onlyKeys.length === 0) return { deleted: 0, failed: 0, skipped: 0 };
  const result =
    await db.execute(sql`SELECT id, organization_id, storage_key FROM storage_cleanup_jobs
    WHERE deleted_at IS NULL ${organizationId ? sql`AND organization_id = ${organizationId}::uuid` : sql``}
    ${
      onlyKeys
        ? sql`AND storage_key IN (${sql.join(
            onlyKeys.map((key) => sql`${key}`),
            sql`, `,
          )})`
        : sql``
    }
    ORDER BY attempts, created_at LIMIT 50`);
  let deleted = 0,
    failed = 0,
    skipped = 0;
  for (const row of result.rows) {
    const key = String(row.storage_key);
    if (
      !row.organization_id ||
      !storageKeyBelongsToOrganization(key, String(row.organization_id))
    ) {
      await db.execute(
        sql`UPDATE storage_cleanup_jobs SET attempts = attempts + 1, last_error = 'Protegido: chave fora do estabelecimento.' WHERE id = ${row.id}::uuid`,
      );
      skipped++;
      continue;
    }
    if (await isStorageKeyReferenced(key)) {
      await db.execute(
        sql`UPDATE storage_cleanup_jobs SET attempts = attempts + 1, last_error = 'Preservado: arquivo ainda referenciado.' WHERE id = ${row.id}::uuid`,
      );
      skipped++;
      continue;
    }
    try {
      await deleteObject(key);
      await db.execute(
        sql`UPDATE storage_cleanup_jobs SET deleted_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = ${row.id}::uuid`,
      );
      deleted++;
    } catch {
      await db.execute(
        sql`UPDATE storage_cleanup_jobs SET attempts = attempts + 1, last_error = 'Falha no armazenamento; tente novamente.' WHERE id = ${row.id}::uuid`,
      );
      failed++;
    }
  }
  return { deleted, failed, skipped };
}
