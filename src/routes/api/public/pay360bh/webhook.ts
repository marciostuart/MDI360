import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pay360bh/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { receivePay360BhNotification } =
          await import("@/lib/billing/pay360bh-webhook.server");
        return receivePay360BhNotification(request);
      },
    },
  },
});
