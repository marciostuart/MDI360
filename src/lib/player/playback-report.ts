import { z } from "zod";

export const playbackReportSchema = z.object({
  eventId: z.string().uuid().optional(),
  playlistId: z.string().uuid().nullish(),
  mediaAssetId: z.string().uuid().nullish(),
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
  completed: z.boolean().optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
});

export function isPlaybackTimeValid(startedAt: Date, now: number) {
  return Number.isFinite(startedAt.getTime()) &&
    startedAt.getTime() <= now + 5 * 60_000 &&
    startedAt.getTime() >= now - 31 * 24 * 3600_000;
}

/** Start/retry/completion have one persistent identity, never a receipt-time UUID. */
export function playbackEventValues(
  body: z.infer<typeof playbackReportSchema>,
  device: { id: string; organizationId: string },
  startedAt: Date,
) {
  return {
    ...(body.eventId ? { id: body.eventId } : {}),
    organizationId: device.organizationId,
    deviceId: device.id,
    playlistId: body.playlistId ?? null,
    mediaAssetId: body.mediaAssetId ?? null,
    startedAt,
    durationMs: body.durationMs ?? 0,
    completed: body.completed ?? !body.eventId,
  };
}
