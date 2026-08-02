import { createFileRoute } from "@tanstack/react-router";

/** Hard ceiling for one screenshot (base64 payload). Keeps storage predictable. */
const MAX_BASE64_CHARS = 6 * 1024 * 1024;

/**
 * Remote monitoring: the player answers a "screenshot" command by capturing its
 * own screen and posting it here. Authenticated by the device token only, and
 * the file is always stored under the owner organization of that screen.
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
        try {
          const body = (await request.json()) as { image?: unknown; contentType?: unknown };
          if (typeof body.image === "string") image = body.image;
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

        let bytes: Uint8Array;
        try {
          const binary = atob(image);
          bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        } catch {
          return Response.json({ error: "Imagem inválida." }, { status: 400 });
        }

        const extension = contentType === "image/png" ? "png" : "jpg";
        const key = `screenshots/${device.organizationId ?? "unlinked"}/${device.id}.${extension}`;

        try {
          const { putObject } = await import("@/lib/storage.server");
          await putObject(key, bytes, contentType);
        } catch (cause) {
          console.error("[player/screenshot] falha ao gravar no storage:", cause);
          return Response.json({ error: "Falha ao salvar a captura." }, { status: 500 });
        }

        const { eq } = await import("drizzle-orm");
        await getDb()
          .update(schema.devices)
          .set({ lastScreenshotKey: key, lastScreenshotAt: new Date(), lastSeenAt: new Date() })
          .where(eq(schema.devices.id, device.id));

        // The Studio list picks the new capture up on its next refresh.
        const { notifyOrganization } = await import("@/lib/player/realtime.server");
        if (device.organizationId) notifyOrganization(device.organizationId);

        return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
