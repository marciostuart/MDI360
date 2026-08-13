import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mercado-pago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { type?: string; data?: { id?: string | number } };
          const url = new URL(request.url);
          const eventType = body.type ?? url.searchParams.get("type") ?? "";
          if (eventType !== "order") {
            return new Response("Evento ignorado", { status: 200 });
          }
          const dataId = String(
            url.searchParams.get("data.id") ?? body.data?.id ?? url.searchParams.get("id") ?? "",
          );
          if (!/^ORD[0-9A-Z]{20,64}$/.test(dataId)) {
            console.warn("[mercado-pago-webhook] order id invalido ignorado", { dataId });
            return new Response("Evento ignorado", { status: 200 });
          }
          const { validateMercadoPagoWebhook, getMercadoPagoOrder } =
            await import("@/lib/billing/mercado-pago.server");
          const credentials = await validateMercadoPagoWebhook(request, dataId);
          if (!credentials) {
            console.warn("[mercado-pago-webhook] assinatura invalida", { dataId, eventType });
            return new Response("Assinatura inválida", { status: 401 });
          }
          const order = await getMercadoPagoOrder(dataId, credentials);
          if (
            order.external_reference?.startsWith("mdi360_sandbox_") ||
            order.external_reference?.startsWith("mdi360-sandbox:")
          ) {
            const { reconcileSandboxOrder } = await import("@/lib/billing/sandbox-payments.server");
            await reconcileSandboxOrder(order, "webhook");
          } else {
            const { reconcileMercadoPagoOrder } = await import("@/lib/billing/payments.server");
            await reconcileMercadoPagoOrder(order, credentials);
          }
          console.info("[mercado-pago-webhook] order conciliada", {
            dataId,
            environment: credentials.environment,
          });
          return new Response("OK", { status: 200 });
        } catch (error) {
          console.error(
            "[mercado-pago-webhook] falha",
            error instanceof Error ? error.message : "erro",
          );
          return new Response("Falha temporária", { status: 500 });
        }
      },
    },
  },
});
