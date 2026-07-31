import { createFileRoute } from "@tanstack/react-router";

/**
 * The TV polls this while it waits to be linked. It authenticates with the
 * token it received at registration and learns whether a customer has claimed
 * its activation code — or whether the row is gone (screen deleted in the
 * Studio), which tells the app to wipe its cache and register again.
 */
export const Route = createFileRoute("/api/public/player/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { recordTraffic } = await import("@/lib/admin/traffic.server");
        recordTraffic(0, 0);
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        }

        const { resolveDeviceByToken } = await import("@/lib/player/player-auth.server");
        const device = await resolveDeviceByToken(request);
        // Unknown token: the screen was unlinked or removed.
        if (!device) return Response.json({ error: "Não autorizado." }, { status: 401 });

        // Optional push mode: the screen holds this request open and the server
        // answers the instant it is claimed, replaced, blocked or removed in the
        // Studio — pairing and "Substituir tela" become immediate instead of
        // waiting for the next poll.
        let wait = false;
        try {
          const body = (await request.json()) as { wait?: unknown };
          wait = body?.wait === true;
        } catch {
          wait = false;
        }

        const { eq } = await import("drizzle-orm");
        await getDb()
          .update(schema.devices)
          .set({ lastSeenAt: new Date() })
          .where(eq(schema.devices.id, device.id));

        const isPending = !(device.organizationId && device.status === "active");
        if (wait && isPending && device.status !== "blocked") {
          const { waitForChange, revisionFor } = await import("@/lib/player/realtime.server");
          const since = revisionFor(device.id, null);
          const changed = await waitForChange(device.id, null, since);
          if (changed > since) {
            // Something happened to this row: re-read it and answer with the
            // fresh state (linked, blocked or a new code).
            const fresh = await resolveDeviceByToken(request);
            if (!fresh) return Response.json({ error: "Não autorizado." }, { status: 401 });
            Object.assign(device, fresh);
          }
        }

        if (device.status === "blocked") {
          return Response.json({ state: "blocked" }, { headers: { "cache-control": "no-store" } });
        }

        if (device.organizationId && device.status === "active") {
          return Response.json(
            {
              state: "linked",
              device: {
                id: device.id,
                name: device.name,
                canvasPreset: device.canvasPreset,
              },
            },
            { headers: { "cache-control": "no-store" } },
          );
        }

        return Response.json(
          { state: "waiting", activationCode: device.pairingCode },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});