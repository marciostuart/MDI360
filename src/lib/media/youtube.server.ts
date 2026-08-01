import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * YouTube import.
 *
 * The video is never embedded on the TV: the server downloads it once, converts
 * it to the same standard MP4 as any upload and stores it in MinIO. That is the
 * only way to satisfy the product rules — no YouTube controls/титles/end
 * screens, audio governed by the item/TV setting, local cache on the device and
 * cache cleanup when the content is removed.
 */
const YTDLP = process.env.YTDLP_PATH?.trim() || "yt-dlp";

/** Accepts watch/short/shorts/embed links and returns the 11-char video id. */
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
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
      return parts[1] ?? null;
    }
    return null;
  };

  const id = url.searchParams.get("v") ?? fromPath();
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export function watchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function run(bin: string, args: string[], timeoutMs: number) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

export type YoutubeMetadata = { title: string; durationMs: number | null };

/** Title + duration, used to name the item and to enforce the length limit. */
export async function fetchYoutubeMetadata(videoId: string): Promise<YoutubeMetadata> {
  const result = await run(
    YTDLP,
    ["--no-warnings", "--no-playlist", "--dump-single-json", watchUrl(videoId)],
    90_000,
  );
  if (result.code !== 0) {
    throw new Error(friendlyError(result.stderr) ?? "Não foi possível ler o vídeo no YouTube.");
  }
  try {
    const json = JSON.parse(result.stdout) as { title?: string; duration?: number };
    return {
      title: (json.title ?? "Vídeo do YouTube").slice(0, 160),
      durationMs: json.duration ? Math.round(json.duration * 1000) : null,
    };
  } catch {
    return { title: "Vídeo do YouTube", durationMs: null };
  }
}

/** Downloads the best <=1080p stream and returns the raw bytes. */
export async function downloadYoutubeVideo(videoId: string): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "mdi360-yt-"));
  try {
    const result = await run(
      YTDLP,
      [
        "--no-warnings",
        "--no-playlist",
        "--no-part",
        "--retries",
        "3",
        "-f",
        "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "--merge-output-format",
        "mp4",
        "-o",
        join(dir, "source.%(ext)s"),
        watchUrl(videoId),
      ],
      20 * 60_000,
    );
    if (result.code !== 0) {
      throw new Error(friendlyError(result.stderr) ?? "Falha ao baixar o vídeo do YouTube.");
    }

    const files = await readdir(dir);
    let biggest: { path: string; size: number } | null = null;
    for (const file of files) {
      const path = join(dir, file);
      const info = await stat(path);
      if (!info.isFile()) continue;
      if (!biggest || info.size > biggest.size) biggest = { path, size: info.size };
    }
    if (!biggest || biggest.size < 1024) throw new Error("Download vazio. Tente novamente.");

    const raw = await readFile(biggest.path);
    const body = new Uint8Array(raw.byteLength);
    body.set(raw);
    return body;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function isYtdlpMissing(error: unknown) {
  return (error as { code?: string })?.code === "ENOENT";
}

/** Turns yt-dlp noise into something the customer can act on. */
function friendlyError(stderr: string): string | null {
  const text = stderr.toLowerCase();
  if (text.includes("private video")) return "Este vídeo é privado.";
  if (text.includes("members-only")) return "Este vídeo é exclusivo para membros do canal.";
  if (text.includes("age") && text.includes("confirm")) {
    return "Vídeo com restrição de idade não pode ser importado.";
  }
  if (text.includes("copyright") || text.includes("blocked")) {
    return "Este vídeo está bloqueado para download.";
  }
  if (text.includes("unavailable")) return "Vídeo indisponível no YouTube.";
  if (text.includes("sign in")) return "O YouTube pediu login para este vídeo.";
  return null;
}
