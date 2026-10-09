import {
  DEFAULT_ACTIVATION_BRANDING,
  normalizeActivationBranding,
  type ActivationBrandStyle,
  type PlayerStateStyle,
} from "@/lib/settings/activation-branding";

type ActivationBranding = {
  name?: string | null;
  splashText?: string | null;
  color?: string | null;
  logoUrl?: string | null;
  activationStyle?: ActivationBrandStyle | null;
};

type ActivationScreenProps = {
  code: string | null;
  message?: string | null;
  branding?: ActivationBranding | null;
};

function rgba(hex: string, opacity: number) {
  const value = hex.replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const red = Number.parseInt(normalized.slice(0, 2), 16) || 0;
  const green = Number.parseInt(normalized.slice(2, 4), 16) || 0;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) || 0;
  return `rgba(${red}, ${green}, ${blue}, ${Math.min(100, Math.max(0, opacity)) / 100})`;
}

function positioned(style: { x: number; y: number; align?: string }) {
  return {
    position: "absolute" as const,
    left: `${style.x}%`,
    top: `${style.y}%`,
    transform: "translate(-50%, -50%)",
    textAlign: (style.align ?? "center") as "left" | "center" | "right",
  };
}

function screenBackground(style: PlayerStateStyle) {
  const backgroundImage = style.backgroundMode === "image" && style.backgroundImageUrl ? `url("${style.backgroundImageUrl.replaceAll('"', "")}")` : undefined;
  const overlay = style.overlayMode === "solid" ? rgba(style.overlayColor, style.overlayOpacity) : style.overlayMode === "gradient" ? `linear-gradient(${style.overlayAngle}deg, ${rgba(style.overlayColor, style.overlayOpacity)}, ${rgba(style.overlayColorEnd, style.overlayOpacityEnd)})` : "transparent";
  return { backgroundColor: style.backgroundColor, backgroundImage, backgroundPosition: "center", backgroundSize: "cover" as const, overlay };
}

export function PlayerStateScreen({ state, branding, message, accent }: { state: "loading" | "empty"; branding?: ActivationBranding | null; message: string; accent?: string | null }) {
  const style = normalizeActivationBranding(branding?.activationStyle ?? DEFAULT_ACTIVATION_BRANDING)[state];
  const title = branding?.splashText ?? branding?.name ?? "MDI 360";
  const background = screenBackground(style);
  return <main className="relative grid min-h-screen w-full overflow-hidden place-items-center bg-black text-white" style={{ backgroundColor: background.backgroundColor, backgroundImage: background.backgroundImage, backgroundPosition: background.backgroundPosition, backgroundSize: background.backgroundSize }}><div className="absolute inset-0" style={{ background: background.overlay }} aria-hidden="true" />{style.logo.visible && branding?.logoUrl ? <img src={branding.logoUrl} alt="" className="absolute max-h-[30vh] object-contain" style={{ ...positioned(style.logo), width: `${style.logo.width}%` }} /> : null}{style.title.visible ? <div className="max-w-[90vw] font-display font-semibold" style={{ ...positioned(style.title), fontSize: `clamp(1rem, ${style.title.size}vw, 8rem)`, color: style.titleColor }}>{title}</div> : null}{style.spinner.visible && state === "loading" ? <div className="absolute animate-spin rounded-full border-[.35vw] border-white/20 border-t-current" style={{ ...positioned(style.spinner), width: `${style.spinner.size}vw`, height: `${style.spinner.size}vw`, color: style.spinnerColor || accent || branding?.color || "#a3e635" }} /> : null}{style.message.visible ? <p className="max-w-[88vw]" style={{ ...positioned(style.message), fontSize: `clamp(.75rem, ${style.message.size}vw, 2.5rem)`, color: style.messageColor }}>{message}</p> : null}</main>;
}

/** Shared activation view for browser terminals and the Android WebView. */
export function ActivationScreen({ code, message, branding }: ActivationScreenProps) {
  const style = normalizeActivationBranding(branding?.activationStyle ?? DEFAULT_ACTIVATION_BRANDING);
  const accent = branding?.color ?? "#a3e635";
  const title = branding?.splashText ?? branding?.name ?? "MDI 360";
  const backgroundImage = style.backgroundMode === "image" && style.backgroundImageUrl
    ? `url("${style.backgroundImageUrl.replaceAll('"', "")}")`
    : undefined;
  const overlay = style.overlayMode === "solid"
    ? rgba(style.overlayColor, style.overlayOpacity)
    : style.overlayMode === "gradient"
      ? `linear-gradient(${style.overlayAngle}deg, ${rgba(style.overlayColor, style.overlayOpacity)}, ${rgba(style.overlayColorEnd, style.overlayOpacityEnd)})`
      : "transparent";

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden bg-black text-white"
      style={{
        backgroundColor: style.backgroundColor,
        backgroundImage,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0" style={{ background: overlay }} aria-hidden="true" />
      {style.logo.visible ? (
        branding?.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt="Logo"
            className="max-h-[30vh] object-contain"
            style={{ ...positioned(style.logo), width: `${style.logo.width}%` }}
          />
        ) : (
          <div
            className="rounded-2xl"
            style={{ ...positioned(style.logo), width: `${style.logo.width}%`, aspectRatio: "1", maxWidth: "180px", backgroundColor: accent }}
            aria-hidden="true"
          />
        )
      ) : null}
      {style.title.visible ? (
        <div
          className="max-w-[90vw] font-display font-semibold"
          style={{ ...positioned(style.title), color: "white", fontSize: `clamp(1rem, ${style.title.size}vw, 8rem)` }}
        >
          {title}
        </div>
      ) : null}
      <div
        className="max-w-[92vw] rounded-[1.2vw] border border-white/20 bg-black/20 px-[3vw] py-[2vw] shadow-2xl backdrop-blur-sm"
        style={{ ...positioned(style.code), color: accent, fontSize: `clamp(2rem, ${style.code.size}vw, 12rem)`, fontWeight: 700, letterSpacing: "0.18em", whiteSpace: "nowrap" }}
      >
        {code ?? "······"}
      </div>
      {style.message.visible ? (
        <p
          className="max-w-[88vw] text-white/75"
          style={{ ...positioned(style.message), fontSize: `clamp(.75rem, ${style.message.size}vw, 2.5rem)` }}
        >
          {message ?? "Aguardando vínculo… esta tela conecta sozinha assim que for vinculada."}
        </p>
      ) : null}
    </main>
  );
}
