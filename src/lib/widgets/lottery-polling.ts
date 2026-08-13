const AUTH_ERROR_BACKOFF_MS = 6 * 60 * 60_000;

export function normalizeRefreshMinutes(value: unknown) {
  return Math.min(1440, Math.max(5, Number(value ?? 30) || 30));
}

export function lotteryRetryDelayMs(message: string, refreshMinutes: number) {
  return /HTTP (401|403)/.test(message)
    ? AUTH_ERROR_BACKOFF_MS
    : Math.max(normalizeRefreshMinutes(refreshMinutes) * 60_000, 15 * 60_000);
}

export { AUTH_ERROR_BACKOFF_MS };
