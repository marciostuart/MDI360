type CardPaymentInput = {
  token: string;
  paymentMethodId: string;
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
