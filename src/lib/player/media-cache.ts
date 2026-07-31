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
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Downloads the file to the local cache. Resolves true only when the whole
 * body landed on the device.
 */
export async function download(url: string): Promise<boolean> {
  if (!supported()) return true; // No Cache API: fall back to direct streaming.
  try {
    const cache = await openCache();
    if (await cache.match(url)) return true;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return false;
    // Read the body fully before storing: a partial response must not count
    // as "ready to play".
    const blob = await response.blob();
    if (blob.size === 0) return false;
    await cache.put(url, new Response(blob, { headers: response.headers }));
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
    const hit = await cache.match(url);
    if (!hit) return null;
    return URL.createObjectURL(await hit.blob());
  } catch {
    return null;
  }
}

/** Drops every cached file that is no longer part of the playlist. */
export async function prune(keep: string[]): Promise<string[]> {
  if (!supported()) return [];
  const removed: string[] = [];
  try {
    const cache = await openCache();
    const keepSet = new Set(keep);
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
