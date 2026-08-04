/**
 * Speech for queue announcements.
 *
 * The web player speaks with the browser's own speech engine, but Roku has no
 * text-to-speech API, so the server has to hand it a ready MP3. Audio is tiny
 * (a couple of seconds) and highly repetitive, so it is cached in memory by
 * text — a busy counter re-announcing "Caixa 1, senha A012" costs one
 * synthesis, not one per call.
 */

type CacheEntry = { bytes: Uint8Array; at: number };

const globalRef = globalThis as unknown as { __mdiTtsCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (globalRef.__mdiTtsCache ??= new Map());

const MAX_ENTRIES = 300;
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Generates the short announcement with a public Portuguese speech endpoint.
 */
async function synthesizeWithFallback(text: string): Promise<Uint8Array | null> {
  try {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pt-BR&q=" +
      encodeURIComponent(text.slice(0, 190));
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0", referer: "https://translate.google.com/" },
    });
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** MP3 bytes for a spoken sentence, or null when no engine is reachable. */
export async function announcementMp3(text: string): Promise<Uint8Array | null> {
  const key = text.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.bytes;

  const bytes = await synthesizeWithFallback(text);
  if (!bytes || bytes.byteLength === 0) return null;

  if (cache.size >= MAX_ENTRIES) {
    // Cheap eviction: drop the oldest inserted key.
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { bytes, at: Date.now() });
  return bytes;
}
