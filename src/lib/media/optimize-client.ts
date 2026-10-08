import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_MS,
  type CanvasPreset,
} from "./presets";

export type PreparedUpload = {
  blob: Blob;
  mimeType: string;
  extension: string;
  kind: "image" | "video";
  width: number;
  height: number;
  durationMs: number | null;
  originalBytes: number;
  optimized: boolean;
  notes: string[];
};

/** Reads the first bytes and compares them to the real signature of the format. */
async function sniffKind(file: File): Promise<"image" | "video" | null> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const hex = Array.from(header)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (hex.startsWith("ffd8ff")) return "image"; // jpeg
  if (hex.startsWith("89504e47")) return "image"; // png
  if (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") return "image"; // webp
  if (hex.slice(8, 16) === "66747970") {
    const brand = String.fromCharCode(...header.slice(8, 12));
    return brand === "ftyp" && hex.slice(16, 24).startsWith("617669") ? "image" : "video";
  }
  if (hex.startsWith("1a45dfa3")) return "video"; // webm/mkv
  return null;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir esta imagem."));
    };
    image.src = url;
  });
}

function loadVideo(file: File) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler este vídeo."));
    };
    video.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao otimizar a imagem."))),
      type,
      quality,
    );
  });
}

/**
 * Normalizes an image to the canvas preset: never larger than the screen, no
 * EXIF/metadata carried over (re-encoding drops it), and re-compressed to webp.
 */
async function prepareImage(file: File, preset: CanvasPreset): Promise<PreparedUpload> {
  const image = await loadImage(file);
  const notes: string[] = [];

  const scale = Math.min(1, preset.width / image.width, preset.height / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não permitiu otimizar a imagem.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, "image/webp", 0.75);

  if (scale < 1) {
    notes.push(`Redimensionada de ${image.width}x${image.height} para ${width}x${height}.`);
  }
  if (blob.size < file.size) {
    notes.push("Recompactada em WebP para carregar mais rápido nas telas.");
  }

  return {
    blob,
    mimeType: "image/webp",
    extension: "webp",
    kind: "image",
    width,
    height,
    durationMs: null,
    originalBytes: file.size,
    optimized: true,
    notes,
  };
}

/**
 * Videos are not re-encoded in the browser (it would freeze the page); we
 * validate them hard instead and warn when the file is heavier than needed.
 */
async function prepareVideo(file: File, preset: CanvasPreset): Promise<PreparedUpload> {
  const video = await loadVideo(file);
  const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null;
  const notes: string[] = [];

  if (durationMs && durationMs > MAX_VIDEO_DURATION_MS) {
    throw new Error("O vídeo passa de 10 minutos. Corte em partes menores.");
  }

  const longest = Math.max(video.videoWidth, video.videoHeight);
  const presetLongest = Math.max(preset.width, preset.height);
  if (longest > presetLongest) {
    notes.push(
      `Resolução ${video.videoWidth}x${video.videoHeight} acima do necessário (${preset.width}x${preset.height}). O vídeo será enviado como está e reduzido no servidor.`,
    );
  }

  return {
    blob: file,
    mimeType: file.type === "video/webm" ? "video/webm" : "video/mp4",
    extension: file.type === "video/webm" ? "webm" : "mp4",
    kind: "video",
    width: video.videoWidth,
    height: video.videoHeight,
    durationMs,
    originalBytes: file.size,
    optimized: false,
    notes,
  };
}

export async function prepareUpload(file: File, preset: CanvasPreset): Promise<PreparedUpload> {
  const sniffed = await sniffKind(file);
  if (!sniffed) throw new Error("Formato não reconhecido. Envie JPG, PNG, WebP, MP4 ou WebM.");

  if (sniffed === "image") {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new Error("Imagem em formato não suportado. Use JPG, PNG ou WebP.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Imagem muito grande. O limite é 40 MB.");
    }
    return prepareImage(file, preset);
  }

  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    throw new Error("Vídeo em formato não suportado. Use MP4 (H.264) ou WebM.");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error("Vídeo muito grande. O limite é 400 MB.");
  }
  return prepareVideo(file, preset);
}
