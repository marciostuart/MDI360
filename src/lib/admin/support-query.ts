import { sql } from "drizzle-orm";
import { SUPPORT_SECRET_FIELDS } from "./support-resources.ts";

// Drizzle expands a JS array into a SQL record, not a PostgreSQL text array.
export function supportSecretFieldsSql() {
  return sql`ARRAY[${sql.join(
    SUPPORT_SECRET_FIELDS.map((field) => sql`${field}`),
    sql`, `,
  )}]::text[]`;
}

export function supportStorageKeys(resource: string, row: Record<string, unknown>) {
  const columns: Record<string, string[]> = {
    queue_panels: [
      "theme_bg_image_key",
      "theme_image_key",
      "kiosk_logo_key",
      "kiosk_image_key",
      "kiosk_bg_image_key",
      "chime_storage_key",
    ],
    media_assets: ["storage_key"],
    devices: ["last_screenshot_key"],
    organizations: ["brand_logo_key"],
  };
  const keys = (columns[resource] ?? [])
    .map((field) => row[field])
    .filter((key): key is string => typeof key === "string" && key.length > 0);
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "backgroundImageKey" && typeof child === "string" && child) keys.push(child);
      else visit(child);
    }
  }
  if (resource === "media_assets") visit(row.widget_config);
  return [...new Set(keys)];
}
