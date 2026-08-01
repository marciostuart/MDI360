/**
 * Conteúdo por streaming (YouTube, lives, rádios e URLs de mídia).
 *
 * Nada é baixado nem guardado em cache: a TV abre o endereço na hora da
 * exibição. Isso resolve os vídeos que o YouTube só entrega ao player oficial
 * (aqueles que pediam login para baixar) e viabiliza conteúdo ao vivo, que por
 * natureza não tem arquivo final para cachear.
 *
 * Este módulo é usado no servidor e no player, então não importa nada de Node.
 */

/** Aceita links watch/short/shorts/embed/live e devolve o id de 11 caracteres. */
export function parseYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYoutube =
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com";
  if (!isYoutube) return null;

  const fromPath = () => {
    const parts = url.pathname.split("/").filter(Boolean);
    if (host === "youtu.be") return parts[0] ?? null;
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") {
      return parts[1] ?? null;
    }
    return null;
  };

  const id = url.searchParams.get("v") ?? fromPath();
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export function isYoutubeUrl(url: string) {
  return parseYoutubeId(url) !== null;
}

/**
 * Endereço do player embutido, configurado para não mostrar nada além do vídeo:
 * sem controles, sem teclado, sem tela cheia, sem sugestões e sem legendas
 * automáticas. O domínio -nocookie evita rastreamento na TV do cliente.
 */
export function buildYoutubeEmbedUrl(
  videoId: string,
  options: { muted: boolean; loop: boolean; origin?: string | null },
) {
  const params = new URLSearchParams({
    autoplay: "1",
    controls: "0",
    disablekb: "1",
    fs: "0",
    modestbranding: "1",
    rel: "0",
    showinfo: "0",
    iv_load_policy: "3",
    cc_load_policy: "0",
    playsinline: "1",
    mute: options.muted ? "1" : "0",
  });
  // O YouTube só repete um vídeo quando ele é uma "playlist" de si mesmo.
  if (options.loop) {
    params.set("loop", "1");
    params.set("playlist", videoId);
  }
  if (options.origin) params.set("origin", options.origin);
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/** Rádios e lives em HLS/MP3 tocam direto na tag <video>, sem player externo. */
export function looksLikeDirectMedia(url: string) {
  return /\.(m3u8|mpd|mp4|webm|mp3|aac|ogg|m4a)(\?|#|$)/i.test(url);
}

/** Valida e normaliza o endereço informado pelo cliente. */
export function normalizeStreamUrl(input: string): { url: string; youtubeId: string | null } | null {
  const raw = input.trim();
  if (!raw) return null;
  const youtubeId = parseYoutubeId(raw);
  if (youtubeId) return { url: `https://www.youtube.com/watch?v=${youtubeId}`, youtubeId };
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return { url: url.toString(), youtubeId: null };
}
