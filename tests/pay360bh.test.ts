import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPay360BhChargePayload,
  isDefinitivePay360BhFailure,
  parsePay360BhCharge,
  PAY360BH_MINIMUM_CENTS,
} from "../src/lib/billing/pay360bh.server.ts";

test("Pay 360BH payload uses cents, normalized document and unique reference", () => {
  const payload = buildPay360BhChargePayload({
    legalName: "  Cliente MDI  ",
    documentNumber: "12.345.678/0001-90",
    email: "financeiro@example.com",
    phone: "+55 (31) 99999-0000",
    amountCents: 12500,
    reference: "mdi360_abcd-1234",
    dueDate: "2026-11-10",
  });
  assert.deepEqual(payload, {
    nome: "Cliente MDI",
    cpf_cnpj: "12345678000190",
    email: "financeiro@example.com",
    telefone: "5531999990000",
    valor_centavos: 12500,
    referencia: "mdi360_abcd-1234",
    vencimento: "2026-11-10",
    descricao: "Fatura MDI 360 mdi360_abcd-1234",
  });
  assert.equal(PAY360BH_MINIMUM_CENTS, 500);
});

test("Pay 360BH charge response is bound to the configured project and reference", () => {
  const parsed = parsePay360BhCharge(
    {
      ok: true,
      projeto: "mdi360",
      resultado: {
        payment_id: "pay-123",
        referencia: "mdi360_ref-1",
        status: "PENDING",
        pix_copia_cola: "000201...",
        qr_code_base64: "data:image/png;base64,aGVsbG8=",
        expira_em: "2026-11-04T12:00:00Z",
      },
    },
    { projectCode: "mdi360", reference: "mdi360_ref-1" },
  );
  assert.equal(parsed.paymentId, "pay-123");
  assert.equal(parsed.expiresAt?.toISOString(), "2026-11-04T12:00:00.000Z");

  assert.throws(
    () =>
      parsePay360BhCharge(
        {
          ok: true,
          projeto: "other",
          resultado: {
            payment_id: "pay-123",
            referencia: "mdi360_ref-1",
            status: "PENDING",
            pix_copia_cola: "000201...",
            qr_code_base64: "aGVsbG8=",
          },
        },
        { projectCode: "mdi360", reference: "mdi360_ref-1" },
      ),
    /PAY360BH_INVALID_RESPONSE/,
  );
});

test("ambiguous and duplicate-reference errors keep the attempt reserved", () => {
  assert.equal(isDefinitivePay360BhFailure(new Error("network timeout")), false);
  assert.equal(
    isDefinitivePay360BhFailure(Object.assign(new Error("conflict"), { status: 409 })),
    false,
  );
  assert.equal(
    isDefinitivePay360BhFailure(Object.assign(new Error("rate limited"), { status: 429 })),
    false,
  );
  assert.equal(
    isDefinitivePay360BhFailure(Object.assign(new Error("invalid profile"), { status: 422 })),
    true,
  );
});
