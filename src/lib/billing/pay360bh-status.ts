/** Only confirmed full receipts can settle an invoice. */
export function isPay360BhReceivedStatus(status: unknown): status is "RECEIVED" | "RECEIVED_IN_CASH" {
  return status === "RECEIVED" || status === "RECEIVED_IN_CASH";
}
