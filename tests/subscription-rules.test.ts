import assert from "node:assert/strict";
import test from "node:test";

import { isSubscriptionExpired } from "../src/lib/admin/subscription-rules.ts";

const now = new Date("2026-08-16T12:00:00-03:00").getTime();

test("ignora vencimento legado quando o faturamento pós-pago está ativo", () => {
  assert.equal(
    isSubscriptionExpired({
      billingEnabled: true,
      expiresAt: new Date("2026-08-14T21:00:00-03:00"),
      now,
    }),
    false,
  );
});

test("mantém o vencimento para assinaturas manuais", () => {
  assert.equal(
    isSubscriptionExpired({
      billingEnabled: false,
      expiresAt: new Date("2026-08-14T21:00:00-03:00"),
      now,
    }),
    true,
  );
});

test("não expira uma assinatura manual dentro da validade", () => {
  assert.equal(
    isSubscriptionExpired({
      billingEnabled: false,
      expiresAt: new Date("2026-08-20T21:00:00-03:00"),
      now,
    }),
    false,
  );
});
