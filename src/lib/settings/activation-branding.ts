export type ActivationBrandStyle = {
  backgroundMode: "color" | "image";
  backgroundColor: string;
  backgroundImageUrl: string | null;
  overlayMode: "none" | "solid" | "gradient";
  overlayColor: string;
  overlayColorEnd: string;
  overlayOpacity: number;
  overlayOpacityEnd: number;
  overlayAngle: number;
  logo: { x: number; y: number; width: number; visible: boolean };
  title: { x: number; y: number; size: number; align: "left" | "center" | "right"; visible: boolean };
  code: { x: number; y: number; size: number; align: "left" | "center" | "right" };
  message: { x: number; y: number; size: number; align: "left" | "center" | "right"; visible: boolean };
};

export const DEFAULT_ACTIVATION_BRANDING: ActivationBrandStyle = {
  backgroundMode: "color",
  backgroundColor: "#0b1220",
  backgroundImageUrl: null,
  overlayMode: "none",
  overlayColor: "#000000",
  overlayColorEnd: "#000000",
  overlayOpacity: 0,
  overlayOpacityEnd: 0,
  overlayAngle: 180,
  logo: { x: 50, y: 27, width: 24, visible: true },
  title: { x: 50, y: 46, size: 3.2, align: "center", visible: true },
  code: { x: 50, y: 63, size: 7, align: "center" },
  message: { x: 50, y: 82, size: 1.4, align: "center", visible: true },
};

export function normalizeActivationBranding(value: unknown): ActivationBrandStyle {
  const input = value && typeof value === "object" ? (value as Partial<ActivationBrandStyle>) : {};
  const number = (candidate: unknown, fallback: number, min: number, max: number) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.min(max, Math.max(min, candidate))
      : fallback;
  const color = (candidate: unknown, fallback: string) =>
    typeof candidate === "string" && /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : fallback;
  const imageUrl = typeof input.backgroundImageUrl === "string" && /^https:\/\//i.test(input.backgroundImageUrl.trim())
    ? input.backgroundImageUrl.trim()
    : null;
  const position = (candidate: unknown, fallback: ActivationBrandStyle["logo"]) => {
    const source = candidate && typeof candidate === "object" ? (candidate as Partial<typeof fallback>) : {};
    return {
      x: number(source.x, fallback.x, 0, 100),
      y: number(source.y, fallback.y, 0, 100),
      width: number(source.width, fallback.width, 1, 100),
      visible: source.visible !== false,
    };
  };
  const text = (candidate: unknown, fallback: { x: number; y: number; size: number; align: "left" | "center" | "right" }) => {
    const source = candidate && typeof candidate === "object" ? (candidate as Partial<typeof fallback>) : {};
    const align: "left" | "center" | "right" = source.align === "left" || source.align === "right" ? source.align : "center";
    return {
      x: number(source.x, fallback.x, 0, 100),
      y: number(source.y, fallback.y, 0, 100),
      size: number(source.size, fallback.size, 0.6, 20),
      align,
    };
  };
  const code = text(input.code, DEFAULT_ACTIVATION_BRANDING.code);
  const title = text(input.title, DEFAULT_ACTIVATION_BRANDING.title);
  const message = text(input.message, DEFAULT_ACTIVATION_BRANDING.message);
  return {
    backgroundMode: input.backgroundMode === "image" ? "image" : "color",
    backgroundColor: color(input.backgroundColor, DEFAULT_ACTIVATION_BRANDING.backgroundColor),
    backgroundImageUrl: imageUrl,
    overlayMode: input.overlayMode === "solid" || input.overlayMode === "gradient" ? input.overlayMode : "none",
    overlayColor: color(input.overlayColor, DEFAULT_ACTIVATION_BRANDING.overlayColor),
    overlayColorEnd: color(input.overlayColorEnd, DEFAULT_ACTIVATION_BRANDING.overlayColorEnd),
    overlayOpacity: number(input.overlayOpacity, 0, 0, 100),
    overlayOpacityEnd: number(input.overlayOpacityEnd, 0, 0, 100),
    overlayAngle: number(input.overlayAngle, 180, 0, 360),
    logo: position(input.logo, DEFAULT_ACTIVATION_BRANDING.logo),
    title: { ...title, visible: !(input.title && typeof input.title === "object" && (input.title as { visible?: boolean }).visible === false) },
    code,
    message: { ...message, visible: !(input.message && typeof input.message === "object" && (input.message as { visible?: boolean }).visible === false) },
  };
}
