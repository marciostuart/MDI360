import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

/**
 * A TV exchanges the 6-digit code shown in the Studio for a long-lived device
 * token. Public by design (the TV has no user session), but the code is
 * single-use, expires, and is invalidated the moment it is redeemed.
 */
export const Route = createFileRoute("/api/public/player/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Código inválido." }, { status: 400 });
        }

        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        }

        const { and, eq, gt } = await import("drizzle-orm");
        const { hashDeviceToken, newDeviceToken } = await import(
          "@/lib/player/player-auth.server"
        );
        const db = getDb();

        const rows = await db
          .select({
            id: schema.devices.id,
            name: schema.devices.name,
            canvasPreset: schema.devices.canvasPreset,
          })
          .from(schema.devices)
          .where(
            and(
              eq(schema.devices.pairingCode, parsed.code),
              gt(schema.devices.pairingExpiresAt, new Date()),
            ),
          )
          .limit(1);

        const device = rows[0];
        // Same generic message for wrong and expired codes.
        if (!device) return Response.json({ error: "Código inválido." }, { status: 404 });

        const token = newDeviceToken();
        await db
          .update(schema.devices)
          .set({
            status: "active",
            tokenHash: hashDeviceToken(token),
            pairingCode: null,
            pairingExpiresAt: null,
            lastSeenAt: new Date(),
          })
          .where(eq(schema.devices.id, device.id));

        return Response.json({
          deviceToken: token,
          device: { id: device.id, name: device.name, canvasPreset: device.canvasPreset },
        });
      },
    },
  },
});