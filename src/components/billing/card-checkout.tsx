import { useEffect, useId, useRef } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options: { locale: string }) => {
      bricks: () => {
        create: (name: string, container: string, options: unknown) => Promise<{ unmount: () => void }>;
      };
    };
  }
}

type Props = {
  publicKey: string;
  amountCents: number;
  onTokenized: (data: {
    token: string;
    paymentMethodId: string;
    documentType?: string;
    documentNumber?: string;
  }) => Promise<void>;
};

export function CardCheckout({ publicKey, amountCents, onTokenized }: Props) {
  const rawId = useId();
  const containerId = `mp-card-${rawId.replaceAll(":", "")}`;
  const callbackRef = useRef(onTokenized);
  callbackRef.current = onTokenized;

  useEffect(() => {
    let mounted = true;
    let controller: { unmount: () => void } | undefined;
    const start = async () => {
      if (!window.MercadoPago) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector<HTMLScriptElement>('script[data-mdi-mp="true"]');
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("SDK indisponível")), { once: true });
            return;
          }
          const script = document.createElement("script");
          script.src = "https://sdk.mercadopago.com/js/v2";
          script.async = true;
          script.dataset.mdiMp = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("SDK indisponível"));
          document.head.appendChild(script);
        });
      }
      if (!mounted || !window.MercadoPago) return;
      const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
      controller = await mp.bricks().create("payment", containerId, {
        initialization: { amount: amountCents / 100 },
        customization: {
          paymentMethods: { creditCard: "all", maxInstallments: 1 },
          visual: { style: { theme: "dark" } },
        },
        callbacks: {
          onReady: () => undefined,
          onError: () => {
            toast.error("Não foi possível carregar o pagamento por cartão.");
          },
          onSubmit: async ({ formData }: { formData: Record<string, unknown> }) => {
            const payer = formData.payer as
              | { identification?: { type?: string; number?: string } }
              | undefined;
            await callbackRef.current({
              token: String(formData.token ?? ""),
              paymentMethodId: String(formData.payment_method_id ?? ""),
              documentType: payer?.identification?.type,
              documentNumber: payer?.identification?.number,
            });
          },
        },
      });
    };
    void start().catch(() => toast.error("Checkout do cartão indisponível."));
    return () => {
      mounted = false;
      controller?.unmount();
    };
  }, [amountCents, containerId, publicKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cartão de crédito</CardTitle>
        <CardDescription>Pagamento à vista. Os dados são enviados diretamente ao Mercado Pago.</CardDescription>
      </CardHeader>
      <CardContent><div id={containerId} /></CardContent>
    </Card>
  );
}
