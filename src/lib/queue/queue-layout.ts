export type QueueLayoutBlock = {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  color: string;
  opacity: number;
  align: "left" | "center" | "right";
  /** Fundo de itens visuais, usado pelos botões do emissor. */
  backgroundColor?: string;
  textCase?: "normal" | "uppercase";
  showIcon?: boolean;
  icon?: "ticket" | "user" | "star" | "heart" | "none";
  buttonGradient?: boolean;
  gradientStartColor?: string;
  gradientEndColor?: string;
  gradientAngle?: number;
  buttonPadding?: number;
  borderRadius?: number;
  overlayColor?: string;
  overlayOpacity?: number;
  overlayGradient?: boolean;
  overlayStartColor?: string;
  overlayStartFrom?: number;
  overlayStartTo?: number;
  overlayEndColor?: string;
  overlayEndFrom?: number;
  overlayEndTo?: number;
  overlayAngle?: number;
  /** Applies only to the queue-call history. */
  historyDirection?: "horizontal" | "vertical";
  historyLimit?: number;
  /** Tempo em segundos para manter a confirmação da senha no emissor. */
  displaySeconds?: number;
  hidden?: boolean;
};

export type QueueLayout = Record<string, QueueLayoutBlock>;

export const CALL_LAYOUT_DEFAULT: QueueLayout = {
  heading: {
    x: 10,
    y: 12,
    w: 80,
    h: 8,
    fontSize: 2.7,
    color: "#38bdf8",
    opacity: 100,
    align: "center",
  },
  ticket: {
    x: 8,
    y: 22,
    w: 84,
    h: 31,
    fontSize: 17.7,
    color: "#ffffff",
    opacity: 100,
    align: "center",
  },
  sector: {
    x: 10,
    y: 56,
    w: 80,
    h: 8,
    fontSize: 5,
    color: "#38bdf8",
    opacity: 100,
    align: "center",
  },
  historyTitle: {
    x: 10,
    y: 77,
    w: 80,
    h: 4,
    fontSize: 1.35,
    color: "#ffffff",
    opacity: 55,
    align: "center",
  },
  history: {
    x: 8,
    y: 82,
    w: 84,
    h: 8,
    fontSize: 3.3,
    color: "#ffffff",
    opacity: 100,
    align: "center",
    historyDirection: "horizontal",
    historyLimit: 3,
  },
  image: {
    x: 75,
    y: 6,
    w: 18,
    h: 18,
    fontSize: 1,
    color: "#ffffff",
    opacity: 100,
    align: "center",
    hidden: true,
  },
};

export const KIOSK_LAYOUT_DEFAULT: QueueLayout = {
  logo: { x: 38, y: 8, w: 24, h: 15, fontSize: 1, color: "#ffffff", opacity: 100, align: "center" },
  title: {
    x: 10,
    y: 27,
    w: 80,
    h: 9,
    fontSize: 3,
    color: "#ffffff",
    opacity: 100,
    align: "center",
  },
  normalButton: {
    x: 12,
    y: 43,
    w: 35,
    h: 18,
    fontSize: 2.1,
    color: "#ffffff",
    backgroundColor: "#2563eb",
    textCase: "normal",
    showIcon: true,
    icon: "ticket",
    buttonGradient: false,
    gradientStartColor: "#2563eb",
    gradientEndColor: "#1d4ed8",
    gradientAngle: 135,
    buttonPadding: 0.6,
    borderRadius: 0.8,
    opacity: 100,
    align: "center",
  },
  priorityButton: {
    x: 53,
    y: 43,
    w: 35,
    h: 18,
    fontSize: 2.1,
    color: "#0b1220",
    backgroundColor: "#f59e0b",
    textCase: "normal",
    showIcon: true,
    icon: "ticket",
    buttonGradient: false,
    gradientStartColor: "#f59e0b",
    gradientEndColor: "#d97706",
    gradientAngle: 135,
    buttonPadding: 0.6,
    borderRadius: 0.8,
    opacity: 100,
    align: "center",
  },
  image: {
    x: 72,
    y: 72,
    w: 20,
    h: 20,
    fontSize: 1,
    color: "#ffffff",
    opacity: 100,
    align: "center",
    hidden: true,
  },
  issuedTitle: {
    x: 10,
    y: 20,
    w: 80,
    h: 8,
    fontSize: 3.2,
    color: "#ffffff",
    opacity: 100,
    align: "center",
  },
  issuedTicket: {
    x: 8,
    y: 32,
    w: 84,
    h: 25,
    fontSize: 15,
    color: "#ffffff",
    opacity: 100,
    align: "center",
  },
  issuedSector: {
    x: 10,
    y: 59,
    w: 80,
    h: 9,
    fontSize: 4.5,
    color: "#ffffff",
    opacity: 100,
    align: "center",
  },
  issuedPrinting: {
    x: 10,
    y: 76,
    w: 80,
    h: 7,
    fontSize: 2.4,
    color: "#ffffff",
    opacity: 100,
    align: "center",
  },
  background: {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    fontSize: 1,
    color: "#ffffff",
    opacity: 100,
    align: "center",
    overlayColor: "#000000",
    overlayOpacity: 0,
    overlayGradient: false,
    overlayStartColor: "#000000",
    overlayStartFrom: 0,
    overlayStartTo: 0,
    overlayEndColor: "#000000",
    overlayEndFrom: 100,
    overlayEndTo: 100,
    overlayAngle: 135,
  },
  issuedBackground: {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    fontSize: 1,
    color: "#ffffff",
    opacity: 100,
    align: "center",
    overlayColor: "#000000",
    overlayOpacity: 0,
    overlayGradient: false,
    overlayStartColor: "#000000",
    overlayStartFrom: 0,
    overlayStartTo: 0,
    overlayEndColor: "#000000",
    overlayEndFrom: 100,
    overlayEndTo: 100,
    overlayAngle: 135,
    displaySeconds: 4,
  },
};

const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

/** Never trust JSON persisted by older Studio builds. Missing properties inherit defaults. */
export function resolveQueueLayout(value: unknown, defaults: QueueLayout): QueueLayout {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([id, fallback]) => {
      const item =
        source[id] && typeof source[id] === "object" ? (source[id] as Record<string, unknown>) : {};
      return [
        id,
        {
          x: number(item.x, fallback.x, 0, 100),
          y: number(item.y, fallback.y, 0, 100),
          w: number(item.w, fallback.w, 2, 100),
          h: number(item.h, fallback.h, 2, 100),
          fontSize: number(item.fontSize, fallback.fontSize, 0.5, 25),
          color: color(item.color, fallback.color),
          backgroundColor: color(item.backgroundColor, fallback.backgroundColor ?? "#000000"),
          textCase: item.textCase === "uppercase" ? "uppercase" : "normal",
          showIcon:
            typeof item.showIcon === "boolean" ? item.showIcon : (fallback.showIcon ?? true),
          icon: ["ticket", "user", "star", "heart", "none"].includes(String(item.icon))
            ? (item.icon as QueueLayoutBlock["icon"])
            : (fallback.icon ?? "ticket"),
          buttonGradient:
            typeof item.buttonGradient === "boolean"
              ? item.buttonGradient
              : (fallback.buttonGradient ?? false),
          gradientStartColor: color(
            item.gradientStartColor,
            fallback.gradientStartColor ?? fallback.backgroundColor ?? "#000000",
          ),
          gradientEndColor: color(
            item.gradientEndColor,
            fallback.gradientEndColor ?? fallback.backgroundColor ?? "#000000",
          ),
          gradientAngle: number(item.gradientAngle, fallback.gradientAngle ?? 135, 0, 360),
          buttonPadding: number(item.buttonPadding, fallback.buttonPadding ?? 0.6, 0, 5),
          borderRadius: number(item.borderRadius, fallback.borderRadius ?? 0.8, 0, 5),
          overlayColor: color(item.overlayColor, fallback.overlayColor ?? "#000000"),
          overlayOpacity: number(item.overlayOpacity, fallback.overlayOpacity ?? 0, 0, 100),
          overlayGradient:
            typeof item.overlayGradient === "boolean"
              ? item.overlayGradient
              : (fallback.overlayGradient ?? false),
          overlayStartColor: color(item.overlayStartColor, fallback.overlayStartColor ?? "#000000"),
          overlayStartFrom: number(item.overlayStartFrom, fallback.overlayStartFrom ?? 0, 0, 100),
          overlayStartTo: number(item.overlayStartTo, fallback.overlayStartTo ?? 0, 0, 100),
          overlayEndColor: color(item.overlayEndColor, fallback.overlayEndColor ?? "#000000"),
          overlayEndFrom: number(item.overlayEndFrom, fallback.overlayEndFrom ?? 100, 0, 100),
          overlayEndTo: number(item.overlayEndTo, fallback.overlayEndTo ?? 100, 0, 100),
          overlayAngle: number(item.overlayAngle, fallback.overlayAngle ?? 135, 0, 360),
          opacity: number(item.opacity, fallback.opacity, 0, 100),
          align: item.align === "left" || item.align === "right" ? item.align : "center",
          historyDirection:
            item.historyDirection === "vertical"
              ? "vertical"
              : (fallback.historyDirection ?? "horizontal"),
          // History is a count, never a fractional layout measurement.
          historyLimit: Math.round(number(item.historyLimit, fallback.historyLimit ?? 3, 1, 8)),
          displaySeconds: Math.round(
            number(item.displaySeconds, fallback.displaySeconds ?? 4, 1, 60),
          ),
          hidden:
            id === "issuedTicket"
              ? false
              : typeof item.hidden === "boolean"
                ? item.hidden
                : Boolean(fallback.hidden),
        } satisfies QueueLayoutBlock,
      ];
    }),
  );
}

export function queueLayoutOverlayCss(block: QueueLayoutBlock | undefined): string | undefined {
  if (!block || !block.overlayOpacity) return undefined;
  const alpha = Math.round(block.overlayOpacity * 2.55)
    .toString(16)
    .padStart(2, "0");
  const withAlpha = (hex: string) => `${hex}${alpha}`;
  if (!block.overlayGradient) return withAlpha(block.overlayColor ?? "#000000");
  return `linear-gradient(${block.overlayAngle ?? 135}deg, ${withAlpha(block.overlayStartColor ?? "#000000")} ${block.overlayStartFrom ?? 0}%, ${withAlpha(block.overlayStartColor ?? "#000000")} ${block.overlayStartTo ?? 0}%, ${withAlpha(block.overlayEndColor ?? "#000000")} ${block.overlayEndFrom ?? 100}%, ${withAlpha(block.overlayEndColor ?? "#000000")} ${block.overlayEndTo ?? 100}%)`;
}
