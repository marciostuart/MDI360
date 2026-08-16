export function isSubscriptionExpired(input: {
  billingEnabled: boolean;
  expiresAt: Date | null;
  now?: number;
}) {
  if (input.billingEnabled || !input.expiresAt) return false;
  return input.expiresAt.getTime() < (input.now ?? Date.now());
}
