import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mercado-pago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { type?: string; data?: { id?: string | number } };
          const url = new URL(request.url);
          const dataId = String(
            url.searchParams.get("data.id") ?? body.data?.id ?? url.searchParams.get("id") ?? "",
          );
          if (!dataId) return new Response("Evento ignorado", { status: 200 });
          const { validateMercadoPagoWebhook, getMercadoPagoOrder } = await import(
            "@/lib/billing/mercado-pago.server"
          );
          if (!validateMercadoPagoWebhook(request, dataId)) {
            return new Response("Assinatura inválida", { status: 401 });
          }
          if (body.type && !["order", "topic_merchant_order_wh"].includes(body.type)) {
            return new Response("Evento ignorado", { status: 200 });
          }
          const { reconcileMercadoPagoOrder } = await import("@/lib/billing/payments.server");
          await reconcileMercadoPagoOrder(await getMercadoPagoOrder(dataId));
          return new Response("OK", { status: 200 });
        } catch (error) {
          console.error("[mercado-pago-webhook] falha", error instanceof Error ? error.message : "erro");
          return new Response("Falha temporária", { status: 500 });
        }
      },
    },
  },
});
