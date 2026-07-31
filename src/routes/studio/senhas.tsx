import { createFileRoute } from "@tanstack/react-router";

import { QueueAddonManager } from "@/components/queue/queue-addon-manager";

export const Route = createFileRoute("/studio/senhas")({
  head: () => ({
    meta: [
      { title: "Sistema de senhas | MDI 360" },
      {
        name: "description",
        content:
          "Habilite a chamada de senhas por TV, crie o acesso do operador e acompanhe as últimas chamadas.",
      },
      { property: "og:title", content: "Sistema de senhas | MDI 360" },
      {
        property: "og:description",
        content: "Chamada de senhas com som e voz nas suas telas MDI 360.",
      },
    ],
  }),
  component: QueueAddonManager,
});
