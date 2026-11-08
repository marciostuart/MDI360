import assert from "node:assert/strict";
import test from "node:test";
import { isPay360BhReceivedStatus } from "../src/lib/billing/pay360bh-status.ts";

test("somente pagamentos recebidos liquidam a fatura", () => {
  assert.equal(isPay360BhReceivedStatus("RECEIVED"), true);
  assert.equal(isPay360BhReceivedStatus("RECEIVED_IN_CASH"), true);
  for (const status of ["PENDING", "CONFIRMED", "REFUNDED", "RECEIVED_IN_CASH_UNDONE", null]) {
    assert.equal(isPay360BhReceivedStatus(status), false);
  }
});
