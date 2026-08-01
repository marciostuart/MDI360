/**
 * Conteúdo por streaming (lives HLS e rádios online).
 *
 * Nada é baixado nem guardado em cache: a TV abre o endereço na hora da
 * exibição, o que é o comportamento correto para conteúdo ao vivo, que por
 * natureza não tem arquivo final para cachear.
 *
 * Este módulo é usado no servidor e no player, então não importa nada de Node.
 */

/** Rádios e lives em HLS/MP3 tocam direto na tag <video>, sem player externo. */
export function looksLikeDirectMedia(url: string) {
  return /\.(m3u8|mpd|mp4|webm|mp3|aac|ogg|m4a)(\?|#|$)/i.test(url);
}

/** Endereços de vídeo do YouTube não são aceitos como conteúdo. */
export function isYoutubeUrl(input: string) {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  return (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  );
}

/** Valida e normaliza o endereço informado pelo cliente. */
export function normalizeStreamUrl(input: string): { url: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  if (isYoutubeUrl(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return { url: url.toString() };
}
