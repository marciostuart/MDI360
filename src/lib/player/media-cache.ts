/**
 * Local media cache for the web player.
 *
 * A newly published file is only allowed on screen after it has been fully
 * downloaded to the device, so the TV never shows a buffering spinner. While a
 * download is in flight the playlist keeps rotating the files already cached.
 * Anything that disappears from the playlist (deleted in the Studio) is removed
 * from the cache on the next sync.
 */
const CACHE_NAME = "mdi360-media-v1";

function supported() {
  return typeof window !== "undefined" && "caches" in window;
}

/**
 * Stable identity of a media file.
 *
 * The playlist arrives with signed links that change on every sync (they carry
 * an expiry and a signature), so using the raw URL as cache key made the device
 * throw the whole cache away and download everything again — the TV then showed
 * "Baixando conteúdo…" and restarted the video. The storage path never changes,
 * so it is what identifies the file locally.
 */
export function keyFor(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return `https://mdi360.local/media${parsed.pathname}`;
  } catch {
    return `https://mdi360.local/media/${encodeURIComponent(url)}`;
  }
}

/** False on browsers without the Cache API — playback then streams directly. */
export function isSupported() {
  return supported();
}

async function openCache() {
  return caches.open(CACHE_NAME);
}

/** True when the URL is already stored locally. */
export async function isCached(url: string): Promise<boolean> {
  if (!supported()) return false;
  try {
    const cache = await openCache();
    return (await cache.match(keyFor(url))) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Downloads the file to the local cache. Resolves true only when the whole
 * body landed completely in the device cache. Browsers without Cache API
 * support are deliberately rejected so partial/network playback cannot enter
 * the autonomous playlist.
 */
export async function download(url: string): Promise<boolean> {
  if (!supported()) return false;
  try {
    const cache = await openCache();
    const key = keyFor(url);
    if (await cache.match(key)) return true;
    const response = await fetch(url, { cache: "no-store" });
    // Cache.put consumes the complete body before resolving, while avoiding
    // an extra full-size Blob copy of a video in JavaScript memory.
    if (response.status !== 200 || !response.body) return false;
    await cache.put(key, response);
    return true;
  } catch {
    return false;
  }
}

/** Local object URL for a cached file (null when it is not cached yet). */
export async function localUrl(url: string): Promise<string | null> {
  if (!supported()) return null;
  try {
    const cache = await openCache();
    const hit = await cache.match(keyFor(url));
    if (!hit) return null;
    return URL.createObjectURL(await hit.blob());
  } catch {
    return null;
  }
}

/**
 * Drops every cached file that is no longer part of the playlist (removed from
 * the list or deleted on the server). Returns the removed cache keys.
 */
export async function prune(keep: string[]): Promise<string[]> {
  if (!supported()) return [];
  const removed: string[] = [];
  try {
    const cache = await openCache();
    const keepSet = new Set(keep.map((url) => keyFor(url)));
    for (const request of await cache.keys()) {
      if (keepSet.has(request.url)) continue;
      await cache.delete(request);
      removed.push(request.url);
    }
  } catch {
    // Storage unavailable; nothing to clean.
  }
  return removed;
}
