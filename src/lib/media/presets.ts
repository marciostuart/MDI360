/**
 * Canvas presets. A "canvas" is the physical screen shape the client is using:
 * a TV lying horizontally, a vertical totem, etc. Every upload is normalized to
 * fit inside one of these, which keeps files small and the player predictable.
 */
export type CanvasPreset = {
  id: string;
  label: string;
  description: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait";
};

export const CANVAS_PRESETS: CanvasPreset[] = [
  {
    id: "landscape-fhd",
    label: "TV horizontal (Full HD)",
    description: "1920 x 1080 — padrão para TVs deitadas",
    width: 1920,
    height: 1080,
    orientation: "landscape",
  },
  {
    id: "portrait-fhd",
    label: "Totem vertical (Full HD)",
    description: "1080 x 1920 — TV/totem em pé",
    width: 1080,
    height: 1920,
    orientation: "portrait",
  },
  {
    id: "portrait-tall",
    label: "Totem estreito (9:32)",
    description: "1080 x 3840 — totens duplos e vitrines altas",
    width: 1080,
    height: 3840,
    orientation: "portrait",
  },
  {
    id: "landscape-ultrawide",
    label: "Painel ultrawide (32:9)",
    description: "3840 x 1080 — faixas e paineis largos",
    width: 3840,
    height: 1080,
    orientation: "landscape",
  },
];

export const DEFAULT_CANVAS_PRESET = CANVAS_PRESETS[0]!;

export function getCanvasPreset(id: string | null | undefined): CanvasPreset {
  return CANVAS_PRESETS.find((preset) => preset.id === id) ?? DEFAULT_CANVAS_PRESET;
}

export const CANVAS_PRESET_IDS = CANVAS_PRESETS.map((preset) => preset.id);

/** Hard ceilings. Anything above is rejected before it reaches the storage. */
export const MAX_IMAGE_BYTES = 40 * 1024 * 1024; // original picked by the user
export const MAX_OPTIMIZED_IMAGE_BYTES = 8 * 1024 * 1024; // after normalization
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB
export const MAX_VIDEO_DURATION_MS = 10 * 60 * 1000;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"];

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}