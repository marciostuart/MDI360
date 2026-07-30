import { createFileRoute } from "@tanstack/react-router";

import { BrandSettings } from "@/components/settings/brand-settings";

export const Route = createFileRoute("/studio/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | MDI 360" },
      {
        name: "description",
        content: "Personalize a logo, o texto de abertura e a cor da sua marca nas TVs.",
      },
      { property: "og:title", content: "Configurações de marca | MDI 360" },
      {
        property: "og:description",
        content: "Logo, texto de abertura e cor da marca exibidos nas telas.",
      },
    ],
  }),
  component: BrandSettings,
});