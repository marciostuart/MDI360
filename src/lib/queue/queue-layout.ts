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
  /** Applies only to the queue-call history. */
  historyDirection?: "horizontal" | "vertical";
  historyLimit?: number;
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
          opacity: number(item.opacity, fallback.opacity, 0, 100),
          align: item.align === "left" || item.align === "right" ? item.align : "center",
          historyDirection:
            item.historyDirection === "vertical"
              ? "vertical"
              : (fallback.historyDirection ?? "horizontal"),
          // History is a count, never a fractional layout measurement.
          historyLimit: Math.round(number(item.historyLimit, fallback.historyLimit ?? 3, 1, 8)),
          hidden: typeof item.hidden === "boolean" ? item.hidden : Boolean(fallback.hidden),
        } satisfies QueueLayoutBlock,
      ];
    }),
  );
}
