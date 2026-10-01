import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/widget-sources")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        const { getSessionUser } = await import("@/lib/auth/session.server");
        const session = device ? null : await getSessionUser();
        const organizationId = device?.organizationId ?? session?.organizationId;
        const { getPublicNewsSources } = await import("@/lib/widgets/data-sources.server");
        const news = (await getPublicNewsSources(organizationId))
          .filter((source) => source.enabled)
          .map(({ id, label, credit }) => ({ id, label, credit }));
        return Response.json(
          { news },
          {
            headers: {
              "cache-control": organizationId
                ? "private, max-age=60"
                : "public, max-age=60",
            },
          },
        );
      },
    },
  },
});