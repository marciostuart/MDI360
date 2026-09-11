import assert from "node:assert/strict";
import test from "node:test";

import { buildBillingPayment } from "../src/lib/billing/payment-payload.ts";

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
