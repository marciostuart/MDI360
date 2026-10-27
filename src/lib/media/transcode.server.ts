import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCanvasPreset } from "./presets";

export type TranscodeResult = {
  body: Uint8Array<ArrayBuffer>;
  mimeType: "video/mp4";
  extension: "mp4";
  transcoded: boolean;
  width: number;
  height: number;
  durationMs: number | null;
};

/** ffmpeg binary (present in the runtime image; overridable per environment). */
const FFMPEG = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH?.trim() || "ffprobe";

function run(args: string[], timeoutMs: number, binary = FFMPEG) {
  return new Promise<{ code: number; stderr: string; stdout: string }>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdout = "";
    child.stdout?.on("data", (chunk) => { stdout = (stdout + String(chunk)).slice(-65536); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
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
      resolve({ code: code ?? -1, stderr, stdout });
    });
  });
}

/**
 * Normalizes ANY uploaded video into one single standard: MP4 container,
 * H.264 Main profile, yuv420p, <=30 FPS, AAC-LC stereo audio,
 * moov atom at the front (faststart) and never larger than the screen preset.
 * Main profile is
 * intentionally used instead of High: older Android TV Box decoders can
 * accept the former reliably while failing after a few seconds on the latter.
 *
 * This is what makes playback predictable on Roku/Android TV: the player only
 * ever receives one codec/container combination, so no device-specific
 * demuxer surprise, no stalling on exotic bitrates.
 *
 * Never publish unvalidated original bytes when conversion is unavailable.
 */
export async function transcodeVideoToStandardMp4(
  input: Uint8Array,
  canvasPreset: string | null | undefined,
): Promise<TranscodeResult> {
  const preset = getCanvasPreset(canvasPreset);
  const dir = await mkdtemp(join(tmpdir(), "mdi360-video-"));
  const inputPath = join(dir, "input.bin");
  const outputPath = join(dir, "output.mp4");

  try {
    await writeFile(inputPath, input);

    const result = await run(
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        // Fit inside the canvas without distorting, and keep dimensions even
        // (H.264 + yuv420p require it).
        "-vf",
        `bwdif=mode=send_frame:parity=auto:deint=interlaced,scale='min(${preset.width},iw)':'min(${preset.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=fps='min(source_fps,30)':round=near`,
        "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn",
        "-map_metadata", "-1", "-map_chapters", "-1",
        "-c:v",
        "libx264",
        "-profile:v",
        "main",
        "-level",
        "4.1",
        "-tune",
        "fastdecode",
        "-refs",
        "2",
        "-bf",
        "0",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-maxrate",
        "10M",
        "-bufsize",
        "20M",
        "-pix_fmt",
        "yuv420p",
        // Preserve 23.976/24/25/29.97/30 cadence; cap higher rates rather than
        // producing 1080p60 that exceeds the shared legacy decoder contract.
        "-fps_mode",
        "cfr",
        "-g",
        "60",
        "-c:a",
        "aac",
        "-profile:a", "aac_low",
        "-b:a",
        "160k",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-shortest",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        outputPath,
      ],
      15 * 60_000,
    );

    if (result.code !== 0) {
      throw new Error(result.stderr.slice(-400) || `ffmpeg saiu com código ${result.code}`);
    }

    const raw = await readFile(outputPath);
    const body = new Uint8Array(raw.byteLength);
    body.set(raw);
    if (body.byteLength < 1024) throw new Error("Saída do ffmpeg vazia.");

    const metadata = await probe(outputPath);
    if (metadata.codec !== "h264" || metadata.pixelFormat !== "yuv420p" || !(metadata.fps > 0) || metadata.fps > 30.01 || !metadata.durationMs || metadata.durationMs > 10 * 60_000 || metadata.width > preset.width || metadata.height > preset.height) {
      throw new Error("Vídeo convertido fora do padrão de compatibilidade.");
    }
    if (!["Main", "Baseline", "Constrained Baseline"].includes(metadata.profile) || !(metadata.level > 0 && metadata.level <= 41) || metadata.bFrames !== 0 || metadata.audio.some((audio) => audio.codec_name !== "aac" || audio.profile !== "LC" || audio.channels > 2 || Number(audio.sample_rate) !== 48000)) {
      throw new Error("Codec convertido fora do padrão compartilhado Android/Roku/navegador.");
    }
    return { body, mimeType: "video/mp4", extension: "mp4", transcoded: true, ...metadata };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function probe(path: string) {
  const result = await run(["-v", "error", "-show_streams", "-show_format", "-of", "json", path], 30_000, FFPROBE);
  if (result.code !== 0) throw new Error("Não foi possível validar a mídia convertida.");
  const data = JSON.parse(result.stdout);
  const stream = data.streams?.find((item: { codec_type?: string }) => item.codec_type === "video");
  if (!stream || !(stream.width > 0) || !(stream.height > 0)) throw new Error("Mídia sem imagem válida.");
  const [n, d] = String(stream.avg_frame_rate || "0/1").split("/").map(Number);
  const seconds = Number(data.format?.duration);
  const audio: { codec_name: string; profile: string; channels: number; sample_rate: string }[] = data.streams.filter((item: { codec_type?: string }) => item.codec_type === "audio");
  return { width: Number(stream.width), height: Number(stream.height), durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null, codec: String(stream.codec_name), pixelFormat: String(stream.pix_fmt), fps: d ? n / d : 0, profile: String(stream.profile), level: Number(stream.level), bFrames: Number(stream.has_b_frames), audio };
}

/** Server enforcement also covers direct uploads and image replacements. */
export async function normalizeImageToStandardPng(input: Uint8Array, canvasPreset: string | null | undefined) {
  const preset = getCanvasPreset(canvasPreset);
  const dir = await mkdtemp(join(tmpdir(), "mdi360-image-"));
  try {
    const inputPath = join(dir, "input.bin");
    const outputPath = join(dir, "output.png");
    await writeFile(inputPath, input);
    const result = await run(["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath, "-vf", `scale='min(${preset.width},iw)':'min(${preset.height},ih)':force_original_aspect_ratio=decrease,setsar=1,format=rgba`, "-map_metadata", "-1", "-frames:v", "1", "-compression_level", "4", outputPath], 60_000);
    if (result.code !== 0) throw new Error(result.stderr.slice(-400) || "Falha ao normalizar imagem.");
    const metadata = await probe(outputPath);
    const body = new Uint8Array(await readFile(outputPath));
    return { body, mimeType: "image/png" as const, extension: "png" as const, width: metadata.width, height: metadata.height, durationMs: null };
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}

export function isFfmpegMissing(error: unknown) {
  return (error as { code?: string })?.code === "ENOENT";
}
