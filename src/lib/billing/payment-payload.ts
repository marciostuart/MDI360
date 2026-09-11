type CardPaymentInput = {
  token: string;
  paymentMethodId: string;
};

type BillingOrderInput = {
  method: "pix" | "card" | "boleto";
  totalAmount: string;
  externalReference: string;
  payerEmail: string;
  payer: Record<string, unknown>;
  payment: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  additionalInfo: Record<string, unknown>;
};

export function buildBillingPayment(
  method: "pix" | "card" | "boleto",
  totalAmount: string,
  card?: CardPaymentInput,
) {
  const basePayment = { amount: totalAmount };

  if (method === "pix") {
    return {
      ...basePayment,
      payment_method: { id: "pix", type: "bank_transfer" },
      expiration_time: "P1D",
    };
  }

  if (method === "card") {
    if (!card?.token || !card.paymentMethodId) throw new Error("INVALID_CARD_DATA");
    return {
      ...basePayment,
      payment_method: {
        id: card.paymentMethodId,
        type: "credit_card",
        token: card.token,
        installments: 1,
        statement_descriptor: "MDI360",
      },
    };
  }

  return {
    ...basePayment,
    payment_method: { id: "boleto", type: "ticket" },
    expiration_time: "P3D",
  };
}

/**
 * Pix uses the minimal payload documented by Mercado Pago. The richer payer,
 * item and risk data remains on card and boleto orders, where those fields are
 * used for approval quality and boleto issuance.
 */
export function buildBillingOrderPayload(input: BillingOrderInput) {
  const base = {
    type: "online",
    processing_mode: "automatic",
    external_reference: input.externalReference,
    total_amount: input.totalAmount,
    transactions: { payments: [input.payment] },
  };

  if (input.method === "pix") {
    return { ...base, payer: { email: input.payerEmail.trim().toLowerCase() } };
  }

  return {
    ...base,
    capture_mode: "automatic",
    description: "Assinatura MDI 360",
    items: input.items,
    additional_info: input.additionalInfo,
    ...(input.method === "card"
      ? {
          config: {
            online: {
              transaction_security: {
                validation: "on_fraud_risk",
                liability_shift: "required",
              },
            },
          },
        }
      : {}),
    payer: input.payer,
  };
}
