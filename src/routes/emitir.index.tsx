import { createFileRoute } from "@tanstack/react-router";

import { QueueIssuerPanel } from "@/components/queue/queue-issuer-panel";

/**
 * Tela de emissão com login: o atendente entra com o usuário criado no painel
 * do cliente e emite senhas apenas das filas liberadas para ele. Cada senha é
 * impressa na impressora térmica ligada ao dispositivo.
 */
export const Route = createFileRoute("/emitir/")({
  head: () => ({
    meta: [
      { title: "Emissão de senhas | MDI 360" },
      {
        name: "description",
        content:
          "Tela de emissão de senhas do MDI 360: entre com seu usuário e imprima senhas normais ou preferenciais.",
      },
      { property: "og:title", content: "Emissão de senhas | MDI 360" },
      {
        property: "og:description",
        content: "Emissão e impressão de senhas normais e preferenciais para atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: QueueIssuerPanel,
});
