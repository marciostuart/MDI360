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
        try {
          const body = (await request.json()) as { revision?: unknown };
          if (typeof body?.revision === "number" && Number.isFinite(body.revision)) {
            since = Math.max(0, Math.trunc(body.revision));
          }
        } catch {
          since = 0;
        }

        const { waitForChange, revisionFor } = await import("@/lib/player/realtime.server");
        const revision = await waitForChange(device.id, device.organizationId, since);

        return Response.json(
          {
            revision,
            changed: revision > since,
            serverRevision: revisionFor(device.id, device.organizationId),
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
