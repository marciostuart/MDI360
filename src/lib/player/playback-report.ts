import { z } from "zod";

export const playbackReportSchema = z.object({
  eventId: z.string().uuid().optional(),
  playlistId: z.string().uuid().nullish(),
  playlistItemId: z.string().uuid().nullish(),
  mediaAssetId: z.string().uuid().nullish(),
  mediaName: z.string().trim().max(500).nullish(),
  mediaKind: z.string().trim().max(32).nullish(),
  playlistName: z.string().trim().max(240).nullish(),
  durationMs: z.number().int().min(0).max(24 * 3600 * 1000).optional(),
  completed: z.boolean().optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
  endedAt: z.string().datetime({ offset: true }).nullish(),
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
    playlistItemId: body.playlistItemId ?? null,
    mediaAssetId: body.mediaAssetId ?? null,
    mediaName: body.mediaName ?? null,
    playlistName: body.playlistName ?? null,
    startedAt,
    endedAt: body.endedAt ? new Date(body.endedAt) : null,
    durationMs: body.durationMs ?? 0,
    completed: body.completed ?? !body.eventId,
  };
}
