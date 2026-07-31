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

/** Lovable AI Gateway (used when the deployment has a key configured). */
async function synthesizeWithGateway(text: string): Promise<Uint8Array | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: text,
        voice: "alloy",
        instructions:
          "Fale em português do Brasil, com voz clara e firme de atendente de fila, pausada.",
        response_format: "mp3",
      }),
    });
    if (!response.ok) {
      console.error("[queue-tts] gateway falhou", response.status, await response.text());
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    console.error("[queue-tts] gateway erro", error);
    return null;
  }
}

/**
 * Keyless fallback so a self-hosted deployment always announces, even without
 * an AI key configured. Short sentences only, which is exactly our case.
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

  const bytes = (await synthesizeWithGateway(text)) ?? (await synthesizeWithFallback(text));
  if (!bytes || bytes.byteLength === 0) return null;

  if (cache.size >= MAX_ENTRIES) {
    // Cheap eviction: drop the oldest inserted key.
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { bytes, at: Date.now() });
  return bytes;
}
