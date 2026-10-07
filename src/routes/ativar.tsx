import { createFileRoute } from "@tanstack/react-router";

import { ActivationScreen } from "@/components/player/activation-screen";
import { normalizeActivationBranding } from "@/lib/settings/activation-branding";

/** Presentation-only activation screen used by the Android WebView too. */
export const Route = createFileRoute("/ativar")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code.trim().toUpperCase().slice(0, 12) : null,
    brand: typeof search.brand === "string" ? search.brand.slice(0, 12000) : null,
  }),
  head: () => ({
    meta: [
      { title: "Vincular terminal · MDI 360" },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#0b1220" },
    ],
  }),
  component: ActivationPage,
});

function ActivationPage() {
  const { code, brand } = Route.useSearch();
  let branding = null;
  if (brand) {
    try {
      const parsed = JSON.parse(brand) as Record<string, unknown>;
      branding = {
        name: typeof parsed.name === "string" ? parsed.name : null,
        splashText: typeof parsed.splashText === "string" ? parsed.splashText : null,
        color: typeof parsed.color === "string" ? parsed.color : null,
        logoUrl: typeof parsed.logoUrl === "string" ? parsed.logoUrl : null,
        activationStyle: normalizeActivationBranding(parsed.activationStyle),
      };
    } catch {
      branding = null;
    }
  }
  return <ActivationScreen code={code} branding={branding} />;
}
