import assert from "node:assert/strict";
import test from "node:test";

import {
  customerProfileSchema,
  isValidCnpj,
  isValidCpf,
} from "../src/lib/billing/customer-profile.ts";

test("valida CPF pelos dígitos verificadores", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("529.982.247-24"), false);
  assert.equal(isValidCpf("111.111.111-11"), false);
});

test("valida CNPJ pelos dígitos verificadores", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-80"), false);
  assert.equal(isValidCnpj("00.000.000/0000-00"), false);
});

test("normaliza e valida um cadastro completo", () => {
  const result = customerProfileSchema.parse({
    legalName: "Cliente Teste",
    documentType: "CPF",
    documentNumber: "529.982.247-25",
    phone: "(31) 99999-9999",
    zipCode: "30110-028",
    street: "Avenida Afonso Pena",
    number: "1000",
    complement: "Sala 1",
    neighborhood: "Centro",
    city: "Belo Horizonte",
    state: "mg",
  });

  assert.equal(result.documentNumber, "52998224725");
  assert.equal(result.phone, "31999999999");
  assert.equal(result.zipCode, "30110028");
  assert.equal(result.state, "MG");
});
