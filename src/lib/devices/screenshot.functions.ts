import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const deviceSchema = z.object({ deviceId: z.string().uuid() });
const requestSchema = deviceSchema.extend({ requestId: z.string().uuid() });

export const requestDeviceScreenshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => deviceSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const { getDb, schema } = await import("@/lib/db/index.server");
    const { and, eq } = await import("drizzle-orm");
    const { randomUUID } = await import("node:crypto");
    const { screenshotRelay } = await import("./screenshot-relay.server");
    const user = await requireUser();
    const db = getDb();
    const rows = await db.select({ id: schema.devices.id }).from(schema.devices)
      .where(and(eq(schema.devices.id, data.deviceId), eq(schema.devices.organizationId, user.organizationId))).limit(1);
    if (!rows.length) throw new Error("Terminal não encontrado.");
    const requestId = randomUUID();
    const owner = { userId: user.id, organizationId: user.organizationId, deviceId: data.deviceId };
    screenshotRelay.begin(requestId, owner);
    try {
      await db.insert(schema.deviceCommands).values({ id: requestId, deviceId: data.deviceId, kind: "screenshot", createdBy: user.id });
      const { notifyDevice } = await import("@/lib/player/realtime.server");
      notifyDevice(data.deviceId);
    } catch (error) { screenshotRelay.cancel(requestId, owner); throw error; }
    return { requestId };
  });

export const consumeDeviceScreenshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("cache-control", "no-store");
    const { requireUser } = await import("@/lib/auth/session.server");
    const { screenshotRelay } = await import("./screenshot-relay.server");
    const user = await requireUser();
    return screenshotRelay.take(data.requestId, { userId: user.id, organizationId: user.organizationId, deviceId: data.deviceId });
  });

export const cancelDeviceScreenshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireUser } = await import("@/lib/auth/session.server");
    const { screenshotRelay } = await import("./screenshot-relay.server");
    const user = await requireUser();
    screenshotRelay.cancel(data.requestId, { userId: user.id, organizationId: user.organizationId, deviceId: data.deviceId });
    return { ok: true };
  });
