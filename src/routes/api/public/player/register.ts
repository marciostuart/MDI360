import { createFileRoute } from "@tanstack/react-router";

/**
 * A freshly installed TV app announces itself here. The server creates an
 * unlinked device row that reserves an activation code and hands the TV a
 * long-lived token. No customer data is touched until someone links the code
 * from the Studio, so an unclaimed TV occupies no slot in any account.
 */
export const Route = createFileRoute("/api/public/player/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        }

        let appVersion: string | undefined;
        try {
          const body = (await request.json()) as { appVersion?: unknown };
          if (typeof body?.appVersion === "string") appVersion = body.appVersion.slice(0, 40);
        } catch {
          appVersion = undefined;
        }

        const { newActivationCode } = await import("@/lib/player/activation-code.server");
        const { newDeviceToken, hashDeviceToken } = await import(
          "@/lib/player/player-auth.server"
        );
        const db = getDb();
        const token = newDeviceToken();

        for (let attempt = 0; attempt < 8; attempt += 1) {
          const activationCode = newActivationCode();
          try {
            const inserted = await db
              .insert(schema.devices)
              .values({
                organizationId: null,
                name: "Tela aguardando vínculo",
                status: "pending",
                pairingCode: activationCode,
                tokenHash: hashDeviceToken(token),
                appVersion: appVersion ?? null,
                lastSeenAt: new Date(),
              })
              .returning({ id: schema.devices.id });

            return Response.json(
              { deviceToken: token, activationCode, deviceId: inserted[0]!.id },
              { headers: { "cache-control": "no-store" } },
            );
          } catch (error) {
            if (attempt === 7) {
              console.error("[player/register] failed", error);
              return Response.json({ error: "Serviço indisponível." }, { status: 503 });
            }
          }
        }

        return Response.json({ error: "Serviço indisponível." }, { status: 503 });
      },
    },
  },
});