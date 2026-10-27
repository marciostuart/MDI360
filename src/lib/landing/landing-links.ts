import { z } from "zod";

export const LANDING_LINKS = {
  brand: { label: "Cabeçalho · Logo MDI 360", href: "#inicio", newTab: false },
  navPlatform: { label: "Menu · Plataforma", href: "#plataforma", newTab: false },
  navFeatures: { label: "Menu · Diferenciais", href: "#diferenciais", newTab: false },
  navAudiences: { label: "Menu · Para quem", href: "#publicos", newTab: false },
  navPartners: { label: "Menu · Revendas", href: "#parceiros", newTab: false },
  navFaq: { label: "Menu · FAQ", href: "#faq", newTab: false },
  headerLogin: { label: "Cabeçalho · Entrar", href: "/entrar?mode=login", newTab: false },
  headerSignup: { label: "Cabeçalho · Criar conta", href: "/entrar?mode=signup", newTab: false },
  heroPrimary: {
    label: "Introdução · Botão principal",
    href: "/entrar?mode=signup",
    newTab: false,
  },
  heroSecondary: { label: "Introdução · Botão secundário", href: "#plataforma", newTab: false },
  diagnostic: { label: "Introdução · Diagnóstico / quiz", href: "/diagnostico", newTab: false },
  partner: {
    label: "Revendas · Falar sobre parceria",
    href: "https://wa.me/5531920051113",
    newTab: true,
  },
  finalPrimary: {
    label: "Fechamento · Criar minha conta",
    href: "/entrar?mode=signup",
    newTab: false,
  },
  finalContact: {
    label: "Fechamento · Conversar com a 360BH",
    href: "https://wa.me/5531920051113",
    newTab: true,
  },
};
export type LandingLinkId = keyof typeof LANDING_LINKS;
export type LandingLink = { href: string; newTab: boolean };
export type LandingLinks = Record<LandingLinkId, LandingLink>;

export const landingHrefSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine((href) => {
    if (
      /[\s\\]/.test(href) ||
      [...href].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(href)
    )
      return false;
    if (href.startsWith("#")) return href.length > 1;
    if (href.startsWith("/") && !href.startsWith("//")) return true;
    try {
      const url = new URL(href);
      if (url.protocol === "http:" || url.protocol === "https:")
        return Boolean(url.hostname) && !url.username && !url.password;
      if (url.protocol === "mailto:") return Boolean(url.pathname);
      if (url.protocol === "tel:") return /^\+?[\d().-]+$/.test(url.pathname);
    } catch {
      /* Invalid or unsupported URL. */
    }
    return false;
  }, "Use https://…, http://…, /caminho, #secao, mailto: ou tel: (sem espaços).");
export const landingLinkSchema = z.object({ href: landingHrefSchema, newTab: z.boolean() });
export const landingLinksSchema = z.object(
  Object.fromEntries(Object.keys(LANDING_LINKS).map((key) => [key, landingLinkSchema])) as Record<
    LandingLinkId,
    typeof landingLinkSchema
  >,
);

/** Existing saved sites retain their WhatsApp URL and all original destinations. */
export function normalizeLandingLinks(value: unknown, legacyWhatsapp?: unknown): LandingLinks {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<LandingLinks>)
      : {};
  const whatsapp = landingHrefSchema.safeParse(legacyWhatsapp);
  return Object.fromEntries(
    Object.entries(LANDING_LINKS).map(([id, defaults]) => {
      const fallback = {
        href:
          (id === "partner" || id === "finalContact") && whatsapp.success
            ? whatsapp.data
            : defaults.href,
        newTab: defaults.newTab,
      };
      const parsed = landingLinkSchema.safeParse({ ...fallback, ...record[id as LandingLinkId] });
      return [id, parsed.success ? parsed.data : fallback];
    }),
  ) as LandingLinks;
}

export function landingAnchorProps(link: LandingLink) {
  return {
    href: link.href,
    target: link.newTab ? "_blank" : "_self",
    rel: link.newTab ? "noopener noreferrer" : undefined,
  };
}
