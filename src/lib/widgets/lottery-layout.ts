/** Selects a modality-specific layout while keeping old shared layouts compatible. */
export function selectLotteryLayout<T>(
  gameId: string | null | undefined,
  gameLayouts?: Record<string, T> | null,
  legacyLayout?: T | null,
): T | null | undefined {
  return (gameId && gameLayouts?.[gameId]) || legacyLayout;
}
