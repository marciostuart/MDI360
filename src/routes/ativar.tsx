import { createFileRoute } from "@tanstack/react-router";

import { ActivationScreen } from "@/components/player/activation-screen";

/** Presentation-only activation screen used by the Android WebView too. */
export const Route = createFileRoute("/ativar")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code.trim().toUpperCase().slice(0, 12) : null,
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
  const { code } = Route.useSearch();
  return <ActivationScreen code={code} />;
}
