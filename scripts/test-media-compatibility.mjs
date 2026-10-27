import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Exercise the actual upload normalizer and real encoders, not copied flags.
const execute = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const dir = await mkdtemp(join(tmpdir(), "mdi-codec-test-"));
const run = (args) => execute(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { timeout: 120000 });
const inspect = async (path) => JSON.parse((await execute(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", path])).stdout);
try {
  const compile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const presetsPath = join(dir, "presets.mjs");
  await writeFile(presetsPath, compile(await readFile("src/lib/media/presets.ts", "utf8")));
  const source = (await readFile("src/lib/media/transcode.server.ts", "utf8")).replace('"./presets"', JSON.stringify(pathToFileURL(presetsPath).href));
  const modulePath = join(dir, "transcode.mjs");
  await writeFile(modulePath, compile(source));
  const { transcodeVideoToStandardMp4, normalizeImageToStandardPng } = await import(pathToFileURL(modulePath).href);

  const sourcePath = join(dir, "source.mp4");
  await run(["-f", "lavfi", "-i", "color=c=blue:s=3840x2160:r=60:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "mpeg4", "-q:v", "4", "-c:a", "aac", "-shortest", sourcePath]);
  const encoded = await transcodeVideoToStandardMp4(new Uint8Array(await readFile(sourcePath)), "landscape-fhd");
  assert.equal(encoded.width, 1920);
  assert.equal(encoded.height, 1080);
  const output = join(dir, "normalized.mp4");
  await writeFile(output, encoded.body);
  const metadata = await inspect(output);
  const video = metadata.streams.find((s) => s.codec_type === "video");
  const audio = metadata.streams.find((s) => s.codec_type === "audio");
  assert.equal(video.codec_name, "h264");
  assert.ok(["Main", "Constrained Baseline", "Baseline"].includes(video.profile));
  assert.equal(video.level, 41);
  assert.equal(video.pix_fmt, "yuv420p");
  assert.equal(video.has_b_frames, 0);
  assert.equal(video.avg_frame_rate, "30/1");
  assert.equal(audio.codec_name, "aac");
  assert.equal(audio.profile, "LC");
  assert.equal(audio.channels, 2);
  assert.equal(Number(audio.sample_rate), 48000);
  const bytes = Buffer.from(encoded.body);
  assert.ok(bytes.indexOf("moov") < bytes.indexOf("mdat"), "MP4 must be faststart");
  console.log("PASS codec: 4K60 -> Full HD30, H.264 Main 4.1, AAC-LC, faststart");

  await run(["-f", "lavfi", "-i", "color=c=red:s=640x360:r=24000/1001:d=1", "-c:v", "mpeg4", sourcePath]);
  const fractional = await transcodeVideoToStandardMp4(new Uint8Array(await readFile(sourcePath)), "landscape-fhd");
  await writeFile(output, fractional.body);
  const fractionalStream = (await inspect(output)).streams[0];
  assert.equal(fractionalStream.width, 640);
  assert.equal(fractionalStream.height, 360);
  assert.equal(fractionalStream.avg_frame_rate, "24000/1001");
  console.log("PASS codec: fractional cadence and smaller resolution preserved, no audio required");

  const imagePath = join(dir, "large.png");
  await run(["-f", "lavfi", "-i", "color=c=green:s=3840x2160", "-frames:v", "1", imagePath]);
  const image = await normalizeImageToStandardPng(new Uint8Array(await readFile(imagePath)), "landscape-fhd");
  assert.equal(image.width, 1920);
  assert.equal(image.height, 1080);
  assert.equal(image.mimeType, "image/png");
  assert.equal(Buffer.from(image.body).subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  console.log("PASS image: Full HD lossless PNG signature and authoritative dimensions");

  await assert.rejects(() => transcodeVideoToStandardMp4(new Uint8Array([1, 2, 3]), null));
  await assert.rejects(() => normalizeImageToStandardPng(new Uint8Array([1, 2, 3]), null));
  console.log("PASS validation: malformed uploads never published as ready");

  const originalBinary = process.env.FFMPEG_PATH;
  process.env.FFMPEG_PATH = join(dir, "missing-ffmpeg");
  const missingPath = join(dir, "missing-converter.mjs");
  await writeFile(missingPath, compile(source));
  const missing = await import(pathToFileURL(missingPath).href);
  await assert.rejects(() => missing.transcodeVideoToStandardMp4(new Uint8Array([1, 2, 3]), null), { code: "ENOENT" });
  if (originalBinary === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = originalBinary;
  console.log("PASS validation: missing converter never falls back to the original");
} finally {
  await rm(dir, { recursive: true, force: true });
}
