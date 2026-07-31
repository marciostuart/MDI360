import { createFileRoute } from "@tanstack/react-router";

import { QueueOperatorPanel } from "@/components/queue/queue-operator-panel";

/**
 * Standalone panel for the queue operator. It has its own login (cookie
 * `mdi_queue_session`) and no access to the Studio: the operator can only call
 * tickets for the screen the customer linked to this account.
 */
export const Route = createFileRoute("/senhas")({
  head: () => ({
    meta: [
      { title: "Chamada de senhas | MDI 360" },
      {
        name: "description",
        content: "Painel exclusivo do operador para chamar senhas na TV vinculada.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Chamada de senhas | MDI 360" },
      { property: "og:description", content: "Painel do operador de chamada de senhas." },
    ],
  }),
  component: QueueOperatorPanel,
});
