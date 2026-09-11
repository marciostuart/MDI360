import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBillingOrderPayload,
  buildBillingPayment,
} from "../src/lib/billing/payment-payload.ts";

test("Pix envia somente propriedades aceitas pelo meio de pagamento", () => {
  assert.deepEqual(buildBillingPayment("pix", "43.42"), {
    amount: "43.42",
    payment_method: { id: "pix", type: "bank_transfer" },
    expiration_time: "P1D",
  });
});

test("boleto envia somente propriedades aceitas pelo meio de pagamento", () => {
  assert.deepEqual(buildBillingPayment("boleto", "43.42"), {
    amount: "43.42",
    payment_method: { id: "boleto", type: "ticket" },
    expiration_time: "P3D",
  });
});

test("descritor da fatura permanece no pagamento por cartao", () => {
  assert.deepEqual(
    buildBillingPayment("card", "43.42", {
      token: "card-token",
      paymentMethodId: "visa",
    }),
    {
      amount: "43.42",
      payment_method: {
        id: "visa",
        type: "credit_card",
        token: "card-token",
        installments: 1,
        statement_descriptor: "MDI360",
      },
    },
  );
});

test("order Pix segue o payload minimo oficial", () => {
  const payment = buildBillingPayment("pix", "43.42");
  assert.deepEqual(
    buildBillingOrderPayload({
      method: "pix",
      totalAmount: "43.42",
      externalReference: "mdi360_attempt",
      payerEmail: " Cliente@Example.com ",
      payer: { email: "Cliente@Example.com", first_name: "Cliente" },
      payment,
      items: [{ title: "Fatura" }],
      additionalInfo: { "payer.authentication_type": "WEB" },
    }),
    {
      type: "online",
      processing_mode: "automatic",
      external_reference: "mdi360_attempt",
      total_amount: "43.42",
      payer: { email: "cliente@example.com" },
      transactions: { payments: [payment] },
    },
  );
});
