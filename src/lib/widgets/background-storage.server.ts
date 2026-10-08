import { createDownloadUrl, isStorageConfigured } from "@/lib/storage.server";
import type { WidgetConfig, WidgetTheme, WidgetBlock } from "./catalog";

/**
 * Widget configurations persist storage keys, never expiring signed URLs.
 * The player and the Studio receive a fresh URL only at read time.
 */
export async function hydrateWidgetImageUrls<T extends WidgetConfig>(
  config: T,
  expiresInSeconds = 6 * 3600,
): Promise<T> {
  if (!isStorageConfigured()) return config;
  const next = JSON.parse(JSON.stringify(config)) as T;

  async function theme(theme: WidgetTheme | undefined) {
    if (theme?.backgroundImageKey) {
      try {
        theme.backgroundImageUrl = await createDownloadUrl(
          theme.backgroundImageKey,
          expiresInSeconds,
        );
      } catch {
        theme.backgroundImageUrl = "";
      }
    }
  }

  async function block(block: WidgetBlock | undefined) {
    if (block?.backgroundImageKey) {
      try {
        block.backgroundImageUrl = await createDownloadUrl(
          block.backgroundImageKey,
          expiresInSeconds,
        );
      } catch {
        block.backgroundImageUrl = "";
      }
    }
  }

  await theme(next.theme);
  if (next.type === "lottery") {
    await Promise.all(Object.values(next.gameThemes ?? {}).map((entry) => theme(entry)));
    await Promise.all(
      Object.values(next.gameLayouts ?? {}).flatMap((layout) =>
        Object.values(layout).map((entry) => block(entry)),
      ),
    );
  }
  if (next.layout) await Promise.all(Object.values(next.layout).map((entry) => block(entry)));
  return next;
}

