import { createFileRoute } from "@tanstack/react-router";
import { MAX_SCREENSHOT_CHARS, screenshotDataUrl } from "@/lib/devices/screenshot-relay";

/** Hard ceiling for one screenshot (base64 payload). Keeps storage predictable. */
const MAX_BASE64_CHARS = MAX_SCREENSHOT_CHARS;

/**
 * Remote monitoring: the player answers a "screenshot" command by capturing its
 * own screen and posting it here. One-use, short-lived transport in RAM only;
 * no image is persisted in the database or object storage.
 */
export const Route = createFileRoute("/api/public/player/screenshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { isDatabaseConfigured, getDb, schema } = await import("@/lib/db/index.server");
        if (!isDatabaseConfigured()) {
          return Response.json({ error: "Serviço indisponível." }, { status: 503 });
        }

        const { authenticateDevice } = await import("@/lib/player/player-auth.server");
        const device = await authenticateDevice(request);
        if (!device) return Response.json({ error: "Não autorizado." }, { status: 401 });

        let image = "";
        let contentType = "image/jpeg";
        let requestId: string | undefined;
        try {
          const body = (await request.json()) as { image?: unknown; contentType?: unknown; requestId?: unknown };
          if (typeof body.image === "string") image = body.image;
          if (typeof body.requestId === "string") requestId = body.requestId;
          if (typeof body.contentType === "string" && body.contentType.startsWith("image/")) {
            contentType = body.contentType;
          }
        } catch {
          image = "";
        }

        // Accepts both a raw base64 string and a data: URL.
        const comma = image.indexOf(",");
        if (image.startsWith("data:")) {
          const header = image.slice(5, comma);
          if (header.startsWith("image/")) contentType = header.split(";")[0]!;
          image = image.slice(comma + 1);
        }
        image = image.trim();
        if (!image) return Response.json({ error: "Imagem ausente." }, { status: 400 });
        if (image.length > MAX_BASE64_CHARS) {
          return Response.json({ error: "Imagem muito grande." }, { status: 413 });
        }

        const dataUrl = screenshotDataUrl(image, contentType);
        if (!dataUrl) {
          return Response.json({ error: "Imagem inválida." }, { status: 400 });
        }
        const { screenshotRelay } = await import("@/lib/devices/screenshot-relay.server");
        if (!device.organizationId || !screenshotRelay.publish(device.id, device.organizationId, requestId, dataUrl)) {
          // Closed/expired modal or an unsolicited capture: discard immediately.
          return Response.json({ ok: true, discarded: true }, { headers: { "cache-control": "no-store" } });
        }

        const { eq } = await import("drizzle-orm");
        await getDb()
          .update(schema.devices)
          .set({ lastSeenAt: new Date() })
          .where(eq(schema.devices.id, device.id));

        return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
