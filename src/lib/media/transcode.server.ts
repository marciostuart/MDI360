import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCanvasPreset } from "./presets";

export type TranscodeResult = {
  body: Uint8Array;
  mimeType: "video/mp4";
  extension: "mp4";
  transcoded: boolean;
};

/** ffmpeg binary (present in the runtime image; overridable per environment). */
const FFMPEG = process.env.FFMPEG_PATH?.trim() || "ffmpeg";

function run(args: string[], timeoutMs: number) {
  return new Promise<{ code: number; stderr: string }>((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
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
      resolve({ code: code ?? -1, stderr });
    });
  });
}

/**
 * Normalizes ANY uploaded video into one single standard: MP4 container,
 * H.264 High profile, yuv420p, 30 fps, AAC stereo audio, moov atom at the
 * front (faststart) and never larger than the screen preset.
 *
 * This is what makes playback predictable on Roku/Android TV: the player only
 * ever receives one codec/container combination, so no device-specific
 * demuxer surprise, no stalling on exotic bitrates.
 *
 * If ffmpeg is unavailable the original bytes are returned untouched so an
 * upload never fails because of the media pipeline.
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
        `scale='min(${preset.width},iw)':'min(${preset.height},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-level",
        "4.0",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-maxrate",
        "6M",
        "-bufsize",
        "12M",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-g",
        "60",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-ar",
        "48000",
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

    const body = new Uint8Array(await readFile(outputPath));
    if (body.byteLength < 1024) throw new Error("Saída do ffmpeg vazia.");

    return { body, mimeType: "video/mp4", extension: "mp4", transcoded: true };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function isFfmpegMissing(error: unknown) {
  return (error as { code?: string })?.code === "ENOENT";
}