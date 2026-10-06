import { createFileRoute } from "@tanstack/react-router";

/**
 * Long-poll "broadcast" channel for paired screens.
 *
 * The TV keeps one request open here; the server answers instantly the moment
 * the Studio changes something for that screen (playlist, agenda, comando,
 * branding) and otherwise closes after ~25s so the connection stays healthy
 * behind Traefik/Cloudflare. One idle socket per TV is far cheaper than
 * frequent polling, and the screens keep polling periodically as a fallback.
 */
export const Route = createFileRoute("/api/public/player/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { recordTraffic } = await import("@/lib/admin/traffic.server");
        recordTraffic(0, 0);
        const { isDatabaseConfigured } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        }

        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device) return Response.json({ error: "Não autorizado." }, { status: 401 });

        let since = 0;
        let contentRevision = "";
        try {
          const body = (await request.json()) as {
            revision?: unknown;
            contentRevision?: unknown;
          };
          if (typeof body?.revision === "number" && Number.isFinite(body.revision)) {
            since = Math.max(0, Math.trunc(body.revision));
          }
          if (typeof body?.contentRevision === "string" && body.contentRevision.length <= 250_000) {
            contentRevision = body.contentRevision;
          }
        } catch {
          since = 0;
        }

        const { waitForChange, revisionFor } = await import("@/lib/player/realtime.server");
        const revision = await waitForChange(device.id, device.organizationId, since);
        // The in-memory bus wakes screens immediately when both requests hit
        // the same process. After its regular long-poll timeout, compare the
        // resolved database plan too: this makes updates reliable across Swarm
        // replicas and after process restarts.
        const { playbackPlanRevision, resolvePlaybackPlanForDevice } = await import(
          "@/lib/player/schedule-resolver.server"
        );
        const currentContentRevision = playbackPlanRevision(
          await resolvePlaybackPlanForDevice(device.id),
        );
        const realtimeChanged = revision > since;
        const contentChanged = currentContentRevision !== contentRevision;

        return Response.json(
          {
            revision,
            contentRevision: currentContentRevision,
            changed: realtimeChanged || contentChanged,
            serverRevision: revisionFor(device.id, device.organizationId),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
